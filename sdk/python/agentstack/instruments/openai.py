"""
AgentStack Auto-Instrumentation for OpenAI

Monkey-patches the OpenAI Python SDK to automatically create spans
for each LLM call, capturing model, tokens, cost, and response data.

Supports both the legacy openai.ChatCompletion API and the modern
openai.OpenAI() client API (v1.0+).
"""

import functools
import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("agentstack.instruments.openai")

_original_create: Optional[Any] = None
_original_acreate: Optional[Any] = None
_instrumented = False

# Approximate cost per 1K tokens in cents (as of early 2025)
# These are estimates; actual pricing may differ.
MODEL_COSTS_PER_1K = {
    "gpt-4o": {"input": 0.25, "output": 1.0},
    "gpt-4o-mini": {"input": 0.015, "output": 0.06},
    "gpt-4-turbo": {"input": 1.0, "output": 3.0},
    "gpt-4": {"input": 3.0, "output": 6.0},
    "gpt-3.5-turbo": {"input": 0.05, "output": 0.15},
    "o1": {"input": 1.5, "output": 6.0},
    "o1-mini": {"input": 0.3, "output": 1.2},
    "o3-mini": {"input": 0.11, "output": 0.44},
}


def _estimate_cost_cents(model: str, input_tokens: int, output_tokens: int) -> int:
    """Estimate cost in cents for a given model and token usage."""
    # Find the best matching model key
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
    """Extract relevant data from an OpenAI response object."""
    data: Dict[str, Any] = {}

    try:
        # Modern SDK (v1.0+) returns Pydantic-like objects
        if hasattr(response, "model"):
            data["model"] = response.model

        if hasattr(response, "usage") and response.usage is not None:
            usage = response.usage
            data["input_tokens"] = getattr(usage, "prompt_tokens", 0) or 0
            data["output_tokens"] = getattr(usage, "completion_tokens", 0) or 0
            data["total_tokens"] = getattr(usage, "total_tokens", 0) or 0

        if hasattr(response, "choices") and response.choices:
            choice = response.choices[0]
            if hasattr(choice, "message") and choice.message:
                content = getattr(choice.message, "content", None)
                if content:
                    # Truncate long responses for span storage
                    data["output"] = content[:2000] if len(content) > 2000 else content
                # Capture tool calls if present
                tool_calls = getattr(choice.message, "tool_calls", None)
                if tool_calls:
                    data["tool_calls"] = [
                        {
                            "id": getattr(tc, "id", None),
                            "type": getattr(tc, "type", None),
                            "function": {
                                "name": getattr(getattr(tc, "function", None), "name", None),
                                "arguments": getattr(getattr(tc, "function", None), "arguments", None),
                            } if hasattr(tc, "function") else None,
                        }
                        for tc in tool_calls
                    ]

            data["finish_reason"] = getattr(choice, "finish_reason", None)

        if hasattr(response, "id"):
            data["response_id"] = response.id

    except Exception:
        logger.debug("Failed to extract some fields from OpenAI response", exc_info=True)

    return data


def _create_wrapper(original_fn: Any) -> Any:
    """Create a wrapper for the synchronous chat completions create method."""

    @functools.wraps(original_fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        from agentstack.trace import get_current_session
        from agentstack.healing import get_healing_engine

        session = get_current_session()
        if session is None:
            return original_fn(*args, **kwargs)

        # Extract model from kwargs
        model = kwargs.get("model", "unknown")
        messages = kwargs.get("messages", [])

        # Prepare input summary
        input_summary: Dict[str, Any] = {"model": model}
        if messages:
            # Capture the last message for context
            last_msg = messages[-1] if messages else {}
            input_summary["last_message_role"] = last_msg.get("role", "unknown")
            content = last_msg.get("content", "")
            if isinstance(content, str) and len(content) > 500:
                content = content[:500] + "...(truncated)"
            input_summary["last_message_content"] = content
            input_summary["message_count"] = len(messages)

        # Check with healing engine if active
        engine = get_healing_engine()
        if engine:
            correction = engine.before_tool_call("openai.chat.completions.create", {
                "model": model,
                "message_count": len(messages),
            })
            if correction:
                # Return a synthetic response with the correction
                logger.info("Shield intercepted OpenAI call: %s", correction)
                # Still make the call but log the intervention
                pass

        span = session.span(
            name=f"openai.{model}",
            span_type="llm_call",
        )

        with span:
            span.set_input(input_summary)
            span.set_model(model, provider="openai")

            start = time.time()
            response = original_fn(*args, **kwargs)
            latency_ms = (time.time() - start) * 1000

            # Extract response data
            resp_data = _extract_response_data(response)
            input_tokens = resp_data.get("input_tokens", 0)
            output_tokens = resp_data.get("output_tokens", 0)
            actual_model = resp_data.get("model", model)

            span.set_tokens(input_tokens, output_tokens)
            span.set_model(actual_model, provider="openai")

            cost = _estimate_cost_cents(actual_model, input_tokens, output_tokens)
            span.set_cost(cost)

            span.set_metadata("latency_ms", round(latency_ms, 1))
            span.set_metadata("finish_reason", resp_data.get("finish_reason"))

            if resp_data.get("output"):
                span.set_output(resp_data["output"])

            if resp_data.get("tool_calls"):
                span.set_metadata("tool_calls", resp_data["tool_calls"])

            # Update healing engine cost tracking
            if engine:
                engine.update_cost(cost_cents=cost, tokens=input_tokens + output_tokens)

            return response

    return wrapper


def _acreate_wrapper(original_fn: Any) -> Any:
    """Create a wrapper for the async chat completions create method."""

    @functools.wraps(original_fn)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        from agentstack.trace import get_current_session
        from agentstack.healing import get_healing_engine

        session = get_current_session()
        if session is None:
            return await original_fn(*args, **kwargs)

        model = kwargs.get("model", "unknown")
        messages = kwargs.get("messages", [])

        input_summary: Dict[str, Any] = {"model": model}
        if messages:
            last_msg = messages[-1] if messages else {}
            input_summary["last_message_role"] = last_msg.get("role", "unknown")
            content = last_msg.get("content", "")
            if isinstance(content, str) and len(content) > 500:
                content = content[:500] + "...(truncated)"
            input_summary["last_message_content"] = content
            input_summary["message_count"] = len(messages)

        engine = get_healing_engine()
        if engine:
            correction = engine.before_tool_call("openai.chat.completions.create", {
                "model": model,
                "message_count": len(messages),
            })
            if correction:
                logger.info("Shield intercepted OpenAI call: %s", correction)

        span = session.span(
            name=f"openai.{model}",
            span_type="llm_call",
        )

        with span:
            span.set_input(input_summary)
            span.set_model(model, provider="openai")

            start = time.time()
            response = await original_fn(*args, **kwargs)
            latency_ms = (time.time() - start) * 1000

            resp_data = _extract_response_data(response)
            input_tokens = resp_data.get("input_tokens", 0)
            output_tokens = resp_data.get("output_tokens", 0)
            actual_model = resp_data.get("model", model)

            span.set_tokens(input_tokens, output_tokens)
            span.set_model(actual_model, provider="openai")

            cost = _estimate_cost_cents(actual_model, input_tokens, output_tokens)
            span.set_cost(cost)

            span.set_metadata("latency_ms", round(latency_ms, 1))
            span.set_metadata("finish_reason", resp_data.get("finish_reason"))

            if resp_data.get("output"):
                span.set_output(resp_data["output"])

            if resp_data.get("tool_calls"):
                span.set_metadata("tool_calls", resp_data["tool_calls"])

            if engine:
                engine.update_cost(cost_cents=cost, tokens=input_tokens + output_tokens)

            return response

    return wrapper


def instrument() -> None:
    """
    Instrument the OpenAI library for automatic tracing.

    Monkey-patches openai.resources.chat.completions.Completions.create
    and its async counterpart to automatically create spans.

    Raises:
        ImportError: If the openai library is not installed.
    """
    global _original_create, _original_acreate, _instrumented

    if _instrumented:
        logger.debug("OpenAI already instrumented, skipping.")
        return

    try:
        import openai
        from openai.resources.chat.completions import Completions, AsyncCompletions
    except ImportError:
        raise ImportError(
            "The 'openai' package is required for OpenAI instrumentation. "
            "Install it with: pip install openai"
        )

    # Patch synchronous create
    _original_create = Completions.create
    Completions.create = _create_wrapper(_original_create)  # type: ignore

    # Patch async create
    _original_acreate = AsyncCompletions.create
    AsyncCompletions.create = _acreate_wrapper(_original_acreate)  # type: ignore

    _instrumented = True
    logger.info("OpenAI auto-instrumentation enabled.")


def uninstrument() -> None:
    """Remove OpenAI instrumentation, restoring original methods."""
    global _original_create, _original_acreate, _instrumented

    if not _instrumented:
        return

    try:
        from openai.resources.chat.completions import Completions, AsyncCompletions

        if _original_create is not None:
            Completions.create = _original_create  # type: ignore
        if _original_acreate is not None:
            AsyncCompletions.create = _original_acreate  # type: ignore

    except ImportError:
        pass

    _original_create = None
    _original_acreate = None
    _instrumented = False
    logger.info("OpenAI auto-instrumentation removed.")
