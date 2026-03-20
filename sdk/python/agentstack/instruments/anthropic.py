"""
AgentStack Auto-Instrumentation for Anthropic

Monkey-patches the Anthropic Python SDK to automatically create spans
for each message/completion call, capturing model, tokens, cost, and
response data.

Supports the anthropic.Anthropic() client API.
"""

import functools
import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("agentstack.instruments.anthropic")

_original_create: Optional[Any] = None
_original_acreate: Optional[Any] = None
_instrumented = False

# Approximate cost per 1K tokens in cents (as of early 2025)
MODEL_COSTS_PER_1K = {
    "claude-opus-4": {"input": 1.5, "output": 7.5},
    "claude-sonnet-4": {"input": 0.3, "output": 1.5},
    "claude-3-5-sonnet": {"input": 0.3, "output": 1.5},
    "claude-3-5-haiku": {"input": 0.08, "output": 0.4},
    "claude-3-opus": {"input": 1.5, "output": 7.5},
    "claude-3-sonnet": {"input": 0.3, "output": 1.5},
    "claude-3-haiku": {"input": 0.025, "output": 0.125},
}


def _estimate_cost_cents(model: str, input_tokens: int, output_tokens: int) -> int:
    """Estimate cost in cents for a given model and token usage."""
    costs = None
    for key in MODEL_COSTS_PER_1K:
        if key in model:
            costs = MODEL_COSTS_PER_1K[key]
            break

    if costs is None:
        return 0

    input_cost = (input_tokens / 1000) * costs["input"]
    output_cost = (output_tokens / 1000) * costs["output"]
    return int(round(input_cost + output_cost))


def _extract_response_data(response: Any) -> Dict[str, Any]:
    """Extract relevant data from an Anthropic response object."""
    data: Dict[str, Any] = {}

    try:
        if hasattr(response, "model"):
            data["model"] = response.model

        if hasattr(response, "usage") and response.usage is not None:
            usage = response.usage
            data["input_tokens"] = getattr(usage, "input_tokens", 0) or 0
            data["output_tokens"] = getattr(usage, "output_tokens", 0) or 0

        if hasattr(response, "content") and response.content:
            # Anthropic responses have a list of content blocks
            text_parts = []
            tool_uses = []
            for block in response.content:
                block_type = getattr(block, "type", None)
                if block_type == "text":
                    text = getattr(block, "text", "")
                    text_parts.append(text)
                elif block_type == "tool_use":
                    tool_uses.append({
                        "id": getattr(block, "id", None),
                        "name": getattr(block, "name", None),
                        "input": getattr(block, "input", None),
                    })

            if text_parts:
                combined = "\n".join(text_parts)
                data["output"] = combined[:2000] if len(combined) > 2000 else combined
            if tool_uses:
                data["tool_uses"] = tool_uses

        if hasattr(response, "stop_reason"):
            data["stop_reason"] = response.stop_reason

        if hasattr(response, "id"):
            data["response_id"] = response.id

    except Exception:
        logger.debug("Failed to extract some fields from Anthropic response", exc_info=True)

    return data


def _create_wrapper(original_fn: Any) -> Any:
    """Create a wrapper for the synchronous messages create method."""

    @functools.wraps(original_fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        from agentstack.trace import get_current_session
        from agentstack.healing import get_healing_engine

        session = get_current_session()
        if session is None:
            return original_fn(*args, **kwargs)

        model = kwargs.get("model", "unknown")
        messages = kwargs.get("messages", [])
        system = kwargs.get("system", None)

        input_summary: Dict[str, Any] = {"model": model}
        if messages:
            last_msg = messages[-1] if messages else {}
            input_summary["last_message_role"] = last_msg.get("role", "unknown")
            content = last_msg.get("content", "")
            if isinstance(content, str) and len(content) > 500:
                content = content[:500] + "...(truncated)"
            input_summary["last_message_content"] = content
            input_summary["message_count"] = len(messages)
        if system:
            sys_preview = system[:200] + "..." if len(str(system)) > 200 else system
            input_summary["system"] = sys_preview

        engine = get_healing_engine()
        if engine:
            correction = engine.before_tool_call("anthropic.messages.create", {
                "model": model,
                "message_count": len(messages),
            })
            if correction:
                logger.info("Shield intercepted Anthropic call: %s", correction)

        span = session.span(
            name=f"anthropic.{model}",
            span_type="llm_call",
        )

        with span:
            span.set_input(input_summary)
            span.set_model(model, provider="anthropic")

            start = time.time()
            response = original_fn(*args, **kwargs)
            latency_ms = (time.time() - start) * 1000

            resp_data = _extract_response_data(response)
            input_tokens = resp_data.get("input_tokens", 0)
            output_tokens = resp_data.get("output_tokens", 0)
            actual_model = resp_data.get("model", model)

            span.set_tokens(input_tokens, output_tokens)
            span.set_model(actual_model, provider="anthropic")

            cost = _estimate_cost_cents(actual_model, input_tokens, output_tokens)
            span.set_cost(cost)

            span.set_metadata("latency_ms", round(latency_ms, 1))
            span.set_metadata("stop_reason", resp_data.get("stop_reason"))

            if resp_data.get("output"):
                span.set_output(resp_data["output"])

            if resp_data.get("tool_uses"):
                span.set_metadata("tool_uses", resp_data["tool_uses"])

            if engine:
                engine.update_cost(cost_cents=cost, tokens=input_tokens + output_tokens)

            return response

    return wrapper


def _acreate_wrapper(original_fn: Any) -> Any:
    """Create a wrapper for the async messages create method."""

    @functools.wraps(original_fn)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        from agentstack.trace import get_current_session
        from agentstack.healing import get_healing_engine

        session = get_current_session()
        if session is None:
            return await original_fn(*args, **kwargs)

        model = kwargs.get("model", "unknown")
        messages = kwargs.get("messages", [])
        system = kwargs.get("system", None)

        input_summary: Dict[str, Any] = {"model": model}
        if messages:
            last_msg = messages[-1] if messages else {}
            input_summary["last_message_role"] = last_msg.get("role", "unknown")
            content = last_msg.get("content", "")
            if isinstance(content, str) and len(content) > 500:
                content = content[:500] + "...(truncated)"
            input_summary["last_message_content"] = content
            input_summary["message_count"] = len(messages)
        if system:
            sys_preview = system[:200] + "..." if len(str(system)) > 200 else system
            input_summary["system"] = sys_preview

        engine = get_healing_engine()
        if engine:
            correction = engine.before_tool_call("anthropic.messages.create", {
                "model": model,
                "message_count": len(messages),
            })
            if correction:
                logger.info("Shield intercepted Anthropic call: %s", correction)

        span = session.span(
            name=f"anthropic.{model}",
            span_type="llm_call",
        )

        with span:
            span.set_input(input_summary)
            span.set_model(model, provider="anthropic")

            start = time.time()
            response = await original_fn(*args, **kwargs)
            latency_ms = (time.time() - start) * 1000

            resp_data = _extract_response_data(response)
            input_tokens = resp_data.get("input_tokens", 0)
            output_tokens = resp_data.get("output_tokens", 0)
            actual_model = resp_data.get("model", model)

            span.set_tokens(input_tokens, output_tokens)
            span.set_model(actual_model, provider="anthropic")

            cost = _estimate_cost_cents(actual_model, input_tokens, output_tokens)
            span.set_cost(cost)

            span.set_metadata("latency_ms", round(latency_ms, 1))
            span.set_metadata("stop_reason", resp_data.get("stop_reason"))

            if resp_data.get("output"):
                span.set_output(resp_data["output"])

            if resp_data.get("tool_uses"):
                span.set_metadata("tool_uses", resp_data["tool_uses"])

            if engine:
                engine.update_cost(cost_cents=cost, tokens=input_tokens + output_tokens)

            return response

    return wrapper


def instrument() -> None:
    """
    Instrument the Anthropic library for automatic tracing.

    Monkey-patches anthropic.resources.messages.Messages.create
    and its async counterpart to automatically create spans.

    Raises:
        ImportError: If the anthropic library is not installed.
    """
    global _original_create, _original_acreate, _instrumented

    if _instrumented:
        logger.debug("Anthropic already instrumented, skipping.")
        return

    try:
        import anthropic
        from anthropic.resources.messages import Messages, AsyncMessages
    except ImportError:
        raise ImportError(
            "The 'anthropic' package is required for Anthropic instrumentation. "
            "Install it with: pip install anthropic"
        )

    # Patch synchronous create
    _original_create = Messages.create
    Messages.create = _create_wrapper(_original_create)  # type: ignore

    # Patch async create
    _original_acreate = AsyncMessages.create
    AsyncMessages.create = _acreate_wrapper(_original_acreate)  # type: ignore

    _instrumented = True
    logger.info("Anthropic auto-instrumentation enabled.")


def uninstrument() -> None:
    """Remove Anthropic instrumentation, restoring original methods."""
    global _original_create, _original_acreate, _instrumented

    if not _instrumented:
        return

    try:
        from anthropic.resources.messages import Messages, AsyncMessages

        if _original_create is not None:
            Messages.create = _original_create  # type: ignore
        if _original_acreate is not None:
            AsyncMessages.create = _original_acreate  # type: ignore

    except ImportError:
        pass

    _original_create = None
    _original_acreate = None
    _instrumented = False
    logger.info("Anthropic auto-instrumentation removed.")
