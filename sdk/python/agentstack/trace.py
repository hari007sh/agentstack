"""
AgentStack @trace Decorator

Decorates functions to automatically create spans with input/output
capture, error handling, and optional Shield (self-healing) integration.
"""

import functools
import inspect
import logging
import contextvars
from typing import Any, Callable, Dict, Optional, TypeVar, Union, overload

from agentstack.span import Span
from agentstack.healing import (
    HealingConfig,
    HealingEngine,
    get_healing_engine,
    set_healing_engine,
)

logger = logging.getLogger("agentstack.trace")

# Context variable for the current session
_current_session = contextvars.ContextVar('agentstack_current_session', default=None)

F = TypeVar("F", bound=Callable[..., Any])


def get_current_session():
    """Get the current session from context, or None."""
    return _current_session.get(None)


def set_current_session(session):
    """Set the current session in context."""
    _current_session.set(session)


def _safe_repr(value: Any, max_length: int = 2000) -> Any:
    """
    Safely represent a value for logging/tracing.

    Truncates large strings and handles non-serializable objects.
    """
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        if isinstance(value, str) and len(value) > max_length:
            return value[:max_length] + "...(truncated)"
        return value
    if isinstance(value, (list, tuple)):
        return [_safe_repr(v, max_length) for v in value[:20]]
    if isinstance(value, dict):
        return {
            str(k): _safe_repr(v, max_length)
            for k, v in list(value.items())[:50]
        }
    try:
        s = str(value)
        if len(s) > max_length:
            return s[:max_length] + "...(truncated)"
        return s
    except Exception:
        return f"<{type(value).__name__}>"


def trace(
    name: Optional[str] = None,
    span_type: str = "custom",
    capture_input: bool = True,
    capture_output: bool = True,
    metadata: Optional[Dict[str, Any]] = None,
    healing: bool = False,
    healing_config: Optional[HealingConfig] = None,
) -> Callable[[F], F]:
    """
    Decorator for tracing function execution as spans.

    Automatically creates a span for the decorated function, captures
    input arguments and return values, and records exceptions.

    Args:
        name: Span name. Defaults to the function name.
        span_type: Type of span. One of: llm_call, tool_call, retrieval,
                   chain, agent, custom.
        capture_input: Whether to capture function arguments as span input.
        capture_output: Whether to capture the return value as span output.
        metadata: Optional metadata dict to attach to the span.
        healing: Enable the Shield self-healing engine for this function.
                 Only applicable when span_type is "agent" or "chain".
        healing_config: Custom HealingConfig. If None and healing=True,
                        uses default config.

    Returns:
        Decorated function.

    Example:
        @trace(span_type="llm_call")
        def call_gpt(prompt: str) -> str:
            return openai.chat(prompt)

        @trace(span_type="agent", healing=True)
        def run_agent(task: str) -> str:
            # Shield will auto-detect loops, cost overruns, etc.
            ...
    """

    def decorator(func: F) -> F:
        span_name = name or func.__name__
        is_async = inspect.iscoroutinefunction(func)

        if is_async:
            @functools.wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                session = get_current_session()
                if session is None:
                    # No active session — run without tracing
                    logger.debug(
                        "No active session for @trace('%s'). Running untraced.",
                        span_name,
                    )
                    return await func(*args, **kwargs)

                span = session.span(
                    name=span_name,
                    span_type=span_type,
                    metadata=dict(metadata) if metadata else None,
                )

                # Set up healing if requested
                engine: Optional[HealingEngine] = None
                if healing:
                    config = healing_config or HealingConfig()
                    engine = HealingEngine(config=config, session=session)
                    set_healing_engine(engine)

                with span:
                    if capture_input:
                        input_data = _capture_args(func, args, kwargs)
                        span.set_input(input_data)

                    try:
                        result = await func(*args, **kwargs)

                        if capture_output:
                            span.set_output(_safe_repr(result))

                        return result
                    except Exception as exc:
                        span.set_error(exc)
                        raise
                    finally:
                        if engine:
                            # Store healing summary in span metadata
                            summary = engine.get_summary()
                            if summary["total_interventions"] > 0:
                                span.set_metadata("healing_summary", summary)
                            set_healing_engine(None)

            return async_wrapper  # type: ignore
        else:
            @functools.wraps(func)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                session = get_current_session()
                if session is None:
                    # No active session — run without tracing
                    logger.debug(
                        "No active session for @trace('%s'). Running untraced.",
                        span_name,
                    )
                    return func(*args, **kwargs)

                span = session.span(
                    name=span_name,
                    span_type=span_type,
                    metadata=dict(metadata) if metadata else None,
                )

                # Set up healing if requested
                engine: Optional[HealingEngine] = None
                if healing:
                    config = healing_config or HealingConfig()
                    engine = HealingEngine(config=config, session=session)
                    set_healing_engine(engine)

                with span:
                    if capture_input:
                        input_data = _capture_args(func, args, kwargs)
                        span.set_input(input_data)

                    try:
                        result = func(*args, **kwargs)

                        if capture_output:
                            span.set_output(_safe_repr(result))

                        return result
                    except Exception as exc:
                        span.set_error(exc)
                        raise
                    finally:
                        if engine:
                            summary = engine.get_summary()
                            if summary["total_interventions"] > 0:
                                span.set_metadata("healing_summary", summary)
                            set_healing_engine(None)

            return sync_wrapper  # type: ignore

    return decorator


def _capture_args(func: Callable, args: tuple, kwargs: dict) -> Dict[str, Any]:
    """
    Capture function arguments as a dict suitable for span input.

    Uses inspect to map positional args to parameter names.
    """
    try:
        sig = inspect.signature(func)
        bound = sig.bind(*args, **kwargs)
        bound.apply_defaults()
        return {k: _safe_repr(v) for k, v in bound.arguments.items()}
    except (ValueError, TypeError):
        # Fallback: just capture what we can
        captured: Dict[str, Any] = {}
        if args:
            captured["args"] = [_safe_repr(a) for a in args]
        if kwargs:
            captured["kwargs"] = {k: _safe_repr(v) for k, v in kwargs.items()}
        return captured
