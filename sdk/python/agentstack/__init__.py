"""
AgentStack Python SDK

The open-source SDK for AI agent production monitoring and self-healing.

Quick Start:
    import agentstack

    agentstack.init(api_key="as_sk_...")

    with agentstack.session(agent_name="my-agent") as session:
        with session.span("llm-call", span_type="llm_call") as span:
            span.set_input({"prompt": "Hello"})
            result = call_llm(...)
            span.set_output(result)
            span.set_tokens(100, 50)

    # Or use the @trace decorator:
    @agentstack.trace(span_type="llm_call")
    def call_gpt(prompt: str) -> str:
        return openai.chat(prompt)

    # Enable Shield (self-healing):
    agentstack.protect({"loop_threshold": 3, "cost_limit_cents": 500})
"""

__version__ = "0.1.0"

import atexit
import logging
from contextlib import contextmanager
from typing import Any, Dict, Optional

from agentstack.client import AgentStackClient
from agentstack.session import Session
from agentstack.span import Span
from agentstack.trace import trace, get_current_session, set_current_session
from agentstack.healing import HealingConfig, HealingEngine, CostLimitExceeded
from agentstack import guard
from agentstack import cost
from agentstack.instruments import instrument

logger = logging.getLogger("agentstack")

# Module-level state
_client: Optional[AgentStackClient] = None
_healing_config: Optional[HealingConfig] = None
_initialized: bool = False


def init(
    api_key: str,
    endpoint: str = "http://localhost:8080",
    batch_size: int = 50,
    flush_interval: float = 5.0,
    auto_instrument: Optional[list] = None,
    debug: bool = False,
) -> None:
    """
    Initialize the AgentStack SDK.

    Must be called before creating sessions or using the @trace decorator.

    Args:
        api_key: Your AgentStack API key (format: as_sk_...).
        endpoint: Base URL of the AgentStack API server.
                  Defaults to http://localhost:8080.
        batch_size: Number of events per batch flush (default: 50).
        flush_interval: Seconds between batch flushes (default: 5.0).
        auto_instrument: List of libraries to auto-instrument.
                         E.g., ["openai", "anthropic"]. If None, no
                         auto-instrumentation is enabled.
        debug: Enable debug logging for the SDK.

    Raises:
        ValueError: If api_key is empty.
    """
    global _client, _initialized

    if debug:
        logging.basicConfig(level=logging.DEBUG)
        logger.setLevel(logging.DEBUG)

    _client = AgentStackClient(
        api_key=api_key,
        endpoint=endpoint,
        batch_size=batch_size,
        flush_interval=flush_interval,
    )
    _initialized = True

    # Register shutdown hook
    atexit.register(_shutdown)

    # Auto-instrument libraries if requested
    if auto_instrument:
        instrumented = instrument(auto_instrument)
        if instrumented:
            logger.info("Auto-instrumented: %s", ", ".join(instrumented))

    logger.info("AgentStack SDK initialized (endpoint=%s)", endpoint)


def protect(config: Optional[Dict[str, Any]] = None) -> None:
    """
    Enable Shield (self-healing) with the given configuration.

    When Shield is enabled, the @trace decorator with `healing=True`
    will automatically detect and correct agent failure modes like
    loops, hallucinations, cost overruns, and context overflow.

    Args:
        config: Optional dict of HealingConfig fields. Supported keys:
            - enabled (bool): Enable/disable healing (default: True)
            - loop_threshold (int): Break after N identical calls (default: 3)
            - cost_limit_cents (int): Budget limit in cents (default: 500)
            - context_summarize_at (float): Summarize at N% context (default: 0.8)
            - timeout_seconds (int): Tool timeout (default: 30)
            - timeout_retry (bool): Retry on timeout (default: True)
            - model_fallback (str): Cheaper model on cost limit (default: None)
            - max_retries_per_step (int): Max retries per step (default: 2)

    Example:
        agentstack.protect({
            "loop_threshold": 3,
            "cost_limit_cents": 500,
            "model_fallback": "gpt-4o-mini",
        })
    """
    global _healing_config

    if config is None:
        _healing_config = HealingConfig()
    else:
        _healing_config = HealingConfig(**config)

    logger.info(
        "Shield enabled (loop_threshold=%d, cost_limit=$%.2f)",
        _healing_config.loop_threshold,
        _healing_config.cost_limit_cents / 100,
    )


@contextmanager
def session(
    agent_name: str = "default",
    metadata: Optional[Dict[str, Any]] = None,
    tags: Optional[Dict[str, str]] = None,
    user_id: Optional[str] = None,
):
    """
    Create a new tracing session as a context manager.

    All spans created within the session context are automatically
    associated with this session and sent to the API server.

    Args:
        agent_name: Name of the agent running this session.
        metadata: Optional metadata dict.
        tags: Optional tags dict for filtering.
        user_id: Optional end-user identifier.

    Yields:
        Session instance.

    Example:
        with agentstack.session(agent_name="my-agent") as s:
            with s.span("step1", span_type="llm_call") as span:
                span.set_output("result")
    """
    _ensure_initialized()

    sess = Session(
        client=_client,
        agent_name=agent_name,
        metadata=metadata,
        tags=tags,
        user_id=user_id,
    )

    # Set as current session for @trace decorator
    token = set_current_session(sess)

    try:
        with sess:
            yield sess
    finally:
        set_current_session(None)


def create_session(
    agent_name: str = "default",
    metadata: Optional[Dict[str, Any]] = None,
    tags: Optional[Dict[str, str]] = None,
    user_id: Optional[str] = None,
) -> Session:
    """
    Create a new session without context manager (manual lifecycle).

    You must call session.start() and session.end() manually.

    Args:
        agent_name: Name of the agent.
        metadata: Optional metadata dict.
        tags: Optional tags dict.
        user_id: Optional end-user identifier.

    Returns:
        Session instance.
    """
    _ensure_initialized()

    return Session(
        client=_client,
        agent_name=agent_name,
        metadata=metadata,
        tags=tags,
        user_id=user_id,
    )


def flush() -> None:
    """Force flush all pending events to the API server."""
    if _client:
        _client.flush()


def shutdown() -> None:
    """Gracefully shut down the SDK, flushing all pending events."""
    _shutdown()


def get_client() -> Optional[AgentStackClient]:
    """Get the current AgentStackClient instance, or None if not initialized."""
    return _client


def get_healing_config() -> Optional[HealingConfig]:
    """Get the current HealingConfig, or None if Shield is not enabled."""
    return _healing_config


def _ensure_initialized() -> None:
    """Raise an error if the SDK has not been initialized."""
    if not _initialized or _client is None:
        raise RuntimeError(
            "AgentStack SDK not initialized. Call agentstack.init(api_key=...) first."
        )


def _shutdown() -> None:
    """Internal shutdown handler."""
    global _client, _initialized
    if _client:
        try:
            _client.shutdown()
        except Exception:
            logger.exception("Error during SDK shutdown")
        _client = None
    _initialized = False


# Public API exports
__all__ = [
    "__version__",
    "init",
    "protect",
    "session",
    "create_session",
    "trace",
    "flush",
    "shutdown",
    "get_client",
    "get_healing_config",
    "guard",
    "cost",
    "instrument",
    "Session",
    "Span",
    "HealingConfig",
    "HealingEngine",
    "CostLimitExceeded",
]
