"""
AgentStack Auto-Instrumentation for LangChain

Uses LangChain's callback system (BaseCallbackHandler) to automatically
create spans for LLM calls, chain runs, and tool calls, capturing
model, tokens, prompts, and outputs.

Safe to import even if langchain is not installed.
"""

import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger("agentstack.instruments.langchain")

_instrumented = False
_handler_instance: Optional[Any] = None


def _build_handler_class() -> type:
    """Build the callback handler class dynamically to defer the import."""
    from langchain_core.callbacks import BaseCallbackHandler

    class AgentStackCallbackHandler(BaseCallbackHandler):
        """LangChain callback handler that creates AgentStack spans."""

        def __init__(self) -> None:
            super().__init__()
            # Map run_id -> (span, start_time)
            self._active_spans: Dict[str, Any] = {}

        def _get_session(self) -> Optional[Any]:
            """Get the current AgentStack session, if any."""
            try:
                from agentstack.trace import get_current_session
                return get_current_session()
            except Exception:
                return None

        # --- LLM callbacks ---

        def on_llm_start(
            self,
            serialized: Dict[str, Any],
            prompts: List[str],
            *,
            run_id: Optional[uuid.UUID] = None,
            parent_run_id: Optional[uuid.UUID] = None,
            tags: Optional[List[str]] = None,
            metadata: Optional[Dict[str, Any]] = None,
            **kwargs: Any,
        ) -> None:
            session = self._get_session()
            if session is None:
                return

            run_key = str(run_id) if run_id else str(uuid.uuid4())

            # Extract model name
            model = "unknown"
            if serialized:
                model = (
                    serialized.get("kwargs", {}).get("model_name")
                    or serialized.get("kwargs", {}).get("model")
                    or serialized.get("id", ["unknown"])[-1]
                )

            input_summary: Dict[str, Any] = {"model": model}

            if prompts:
                last_prompt = prompts[-1]
                if len(last_prompt) > 500:
                    last_prompt = last_prompt[:500] + "...(truncated)"
                input_summary["prompt"] = last_prompt
                input_summary["prompt_count"] = len(prompts)

            if tags:
                input_summary["tags"] = tags[:10]

            span = session.span(
                name=f"langchain.llm.{model}",
                span_type="llm_call",
            )
            span.__enter__()
            span.set_input(input_summary)
            span.set_model(model, provider="langchain")

            self._active_spans[run_key] = {
                "span": span,
                "start_time": time.time(),
                "model": model,
            }

        def on_llm_end(
            self,
            response: Any,
            *,
            run_id: Optional[uuid.UUID] = None,
            **kwargs: Any,
        ) -> None:
            run_key = str(run_id) if run_id else None
            if run_key is None or run_key not in self._active_spans:
                return

            entry = self._active_spans.pop(run_key)
            span = entry["span"]
            latency_ms = (time.time() - entry["start_time"]) * 1000

            try:
                span.set_metadata("latency_ms", round(latency_ms, 1))

                # Extract token usage from LLMResult
                if hasattr(response, "llm_output") and response.llm_output:
                    llm_output = response.llm_output
                    token_usage = llm_output.get("token_usage", {})
                    input_tokens = token_usage.get("prompt_tokens", 0)
                    output_tokens = token_usage.get("completion_tokens", 0)
                    if input_tokens or output_tokens:
                        span.set_tokens(input_tokens, output_tokens)
                    model_name = llm_output.get("model_name")
                    if model_name:
                        span.set_model(model_name, provider="langchain")

                # Extract output text
                if hasattr(response, "generations") and response.generations:
                    texts = []
                    for gen_list in response.generations:
                        for gen in gen_list:
                            text = getattr(gen, "text", "")
                            if text:
                                texts.append(text)
                    if texts:
                        combined = "\n".join(texts)
                        if len(combined) > 2000:
                            combined = combined[:2000] + "...(truncated)"
                        span.set_output(combined)
            except Exception:
                logger.debug("Failed to extract LLM response data", exc_info=True)
            finally:
                span.__exit__(None, None, None)

        def on_llm_error(
            self,
            error: BaseException,
            *,
            run_id: Optional[uuid.UUID] = None,
            **kwargs: Any,
        ) -> None:
            run_key = str(run_id) if run_id else None
            if run_key is None or run_key not in self._active_spans:
                return

            entry = self._active_spans.pop(run_key)
            span = entry["span"]
            try:
                span.set_metadata("error", str(error)[:500])
            except Exception:
                pass
            finally:
                span.__exit__(type(error), error, None)

        # --- Chain callbacks ---

        def on_chain_start(
            self,
            serialized: Dict[str, Any],
            inputs: Dict[str, Any],
            *,
            run_id: Optional[uuid.UUID] = None,
            parent_run_id: Optional[uuid.UUID] = None,
            tags: Optional[List[str]] = None,
            metadata: Optional[Dict[str, Any]] = None,
            **kwargs: Any,
        ) -> None:
            session = self._get_session()
            if session is None:
                return

            run_key = str(run_id) if run_id else str(uuid.uuid4())

            chain_name = "chain"
            if serialized:
                chain_name = (
                    serialized.get("name")
                    or serialized.get("id", ["chain"])[-1]
                )

            input_summary: Dict[str, Any] = {"chain": chain_name}
            if isinstance(inputs, dict):
                # Capture input keys and truncated values
                for k, v in list(inputs.items())[:5]:
                    val_str = str(v)
                    if len(val_str) > 200:
                        val_str = val_str[:200] + "...(truncated)"
                    input_summary[k] = val_str

            if tags:
                input_summary["tags"] = tags[:10]

            span = session.span(
                name=f"langchain.chain.{chain_name}",
                span_type="chain",
            )
            span.__enter__()
            span.set_input(input_summary)

            self._active_spans[run_key] = {
                "span": span,
                "start_time": time.time(),
                "chain_name": chain_name,
            }

        def on_chain_end(
            self,
            outputs: Dict[str, Any],
            *,
            run_id: Optional[uuid.UUID] = None,
            **kwargs: Any,
        ) -> None:
            run_key = str(run_id) if run_id else None
            if run_key is None or run_key not in self._active_spans:
                return

            entry = self._active_spans.pop(run_key)
            span = entry["span"]
            latency_ms = (time.time() - entry["start_time"]) * 1000

            try:
                span.set_metadata("latency_ms", round(latency_ms, 1))
                if isinstance(outputs, dict):
                    output_str = str(outputs)
                    if len(output_str) > 2000:
                        output_str = output_str[:2000] + "...(truncated)"
                    span.set_output(output_str)
                elif outputs is not None:
                    output_str = str(outputs)
                    if len(output_str) > 2000:
                        output_str = output_str[:2000] + "...(truncated)"
                    span.set_output(output_str)
            except Exception:
                logger.debug("Failed to extract chain output data", exc_info=True)
            finally:
                span.__exit__(None, None, None)

        def on_chain_error(
            self,
            error: BaseException,
            *,
            run_id: Optional[uuid.UUID] = None,
            **kwargs: Any,
        ) -> None:
            run_key = str(run_id) if run_id else None
            if run_key is None or run_key not in self._active_spans:
                return

            entry = self._active_spans.pop(run_key)
            span = entry["span"]
            try:
                span.set_metadata("error", str(error)[:500])
            except Exception:
                pass
            finally:
                span.__exit__(type(error), error, None)

        # --- Tool callbacks ---

        def on_tool_start(
            self,
            serialized: Dict[str, Any],
            input_str: str,
            *,
            run_id: Optional[uuid.UUID] = None,
            parent_run_id: Optional[uuid.UUID] = None,
            tags: Optional[List[str]] = None,
            metadata: Optional[Dict[str, Any]] = None,
            **kwargs: Any,
        ) -> None:
            session = self._get_session()
            if session is None:
                return

            run_key = str(run_id) if run_id else str(uuid.uuid4())

            tool_name = "tool"
            if serialized:
                tool_name = serialized.get("name", "tool")

            input_summary: Dict[str, Any] = {"tool": tool_name}
            if input_str:
                truncated = input_str[:500] if len(input_str) > 500 else input_str
                input_summary["input"] = truncated

            if tags:
                input_summary["tags"] = tags[:10]

            span = session.span(
                name=f"langchain.tool.{tool_name}",
                span_type="tool_call",
            )
            span.__enter__()
            span.set_input(input_summary)

            self._active_spans[run_key] = {
                "span": span,
                "start_time": time.time(),
                "tool_name": tool_name,
            }

        def on_tool_end(
            self,
            output: str,
            *,
            run_id: Optional[uuid.UUID] = None,
            **kwargs: Any,
        ) -> None:
            run_key = str(run_id) if run_id else None
            if run_key is None or run_key not in self._active_spans:
                return

            entry = self._active_spans.pop(run_key)
            span = entry["span"]
            latency_ms = (time.time() - entry["start_time"]) * 1000

            try:
                span.set_metadata("latency_ms", round(latency_ms, 1))
                if output:
                    output_str = str(output)
                    if len(output_str) > 2000:
                        output_str = output_str[:2000] + "...(truncated)"
                    span.set_output(output_str)
            except Exception:
                logger.debug("Failed to extract tool output data", exc_info=True)
            finally:
                span.__exit__(None, None, None)

        def on_tool_error(
            self,
            error: BaseException,
            *,
            run_id: Optional[uuid.UUID] = None,
            **kwargs: Any,
        ) -> None:
            run_key = str(run_id) if run_id else None
            if run_key is None or run_key not in self._active_spans:
                return

            entry = self._active_spans.pop(run_key)
            span = entry["span"]
            try:
                span.set_metadata("error", str(error)[:500])
            except Exception:
                pass
            finally:
                span.__exit__(type(error), error, None)

    return AgentStackCallbackHandler


def get_callback_handler() -> Any:
    """
    Get an instance of the AgentStack LangChain callback handler.

    Use this to add to your LangChain calls:

        from agentstack.instruments.langchain import get_callback_handler
        handler = get_callback_handler()
        llm.invoke("prompt", config={"callbacks": [handler]})

    Returns:
        An AgentStackCallbackHandler instance.

    Raises:
        ImportError: If langchain-core is not installed.
    """
    global _handler_instance
    if _handler_instance is None:
        handler_class = _build_handler_class()
        _handler_instance = handler_class()
    return _handler_instance


def instrument() -> None:
    """
    Instrument LangChain by setting the AgentStack callback handler
    as a default callback for all LangChain components.

    This patches langchain_core's callback manager to include our
    handler automatically.

    Raises:
        ImportError: If the langchain-core library is not installed.
    """
    global _instrumented

    if _instrumented:
        logger.debug("LangChain already instrumented, skipping.")
        return

    try:
        from langchain_core.callbacks import BaseCallbackHandler
        import langchain_core.callbacks.manager as cb_manager
    except ImportError:
        raise ImportError(
            "The 'langchain-core' package is required for LangChain instrumentation. "
            "Install it with: pip install langchain-core"
        )

    handler = get_callback_handler()

    # Add our handler to the global callback handlers if supported
    try:
        # Modern LangChain uses configure() or env-based default callbacks.
        # We patch _configure to inject our handler.
        original_configure = getattr(cb_manager, "configure", None)

        if original_configure is not None:
            import functools

            @functools.wraps(original_configure)
            def patched_configure(
                inheritable_callbacks: Any = None,
                local_callbacks: Any = None,
                verbose: bool = False,
                inheritable_tags: Any = None,
                local_tags: Any = None,
                inheritable_metadata: Any = None,
                local_metadata: Any = None,
            ) -> Any:
                # Inject our handler into inheritable_callbacks
                if inheritable_callbacks is None:
                    inheritable_callbacks = [handler]
                elif isinstance(inheritable_callbacks, list):
                    # Avoid duplicates
                    if handler not in inheritable_callbacks:
                        inheritable_callbacks = inheritable_callbacks + [handler]
                return original_configure(
                    inheritable_callbacks=inheritable_callbacks,
                    local_callbacks=local_callbacks,
                    verbose=verbose,
                    inheritable_tags=inheritable_tags,
                    local_tags=local_tags,
                    inheritable_metadata=inheritable_metadata,
                    local_metadata=local_metadata,
                )

            cb_manager.configure = patched_configure  # type: ignore
            cb_manager._patched_by_agentstack = True  # type: ignore
        else:
            logger.warning(
                "Could not find langchain_core.callbacks.manager.configure to patch. "
                "Use get_callback_handler() to manually add the handler."
            )
    except Exception:
        logger.warning(
            "Failed to auto-patch LangChain callbacks. "
            "Use get_callback_handler() to manually add the handler.",
            exc_info=True,
        )

    _instrumented = True
    logger.info("LangChain auto-instrumentation enabled.")


def uninstrument() -> None:
    """Remove LangChain instrumentation."""
    global _instrumented, _handler_instance

    if not _instrumented:
        return

    try:
        import langchain_core.callbacks.manager as cb_manager

        # Restore original configure if we patched it
        if hasattr(cb_manager, "_patched_by_agentstack"):
            original = getattr(cb_manager.configure, "__wrapped__", None)
            if original is not None:
                cb_manager.configure = original  # type: ignore
            delattr(cb_manager, "_patched_by_agentstack")
    except (ImportError, AttributeError):
        pass

    _handler_instance = None
    _instrumented = False
    logger.info("LangChain auto-instrumentation removed.")
