"""
AgentStack Auto-Instrumentation for LangGraph

Monkey-patches LangGraph's CompiledGraph.invoke() and
CompiledGraph.stream() to automatically create spans for graph execution,
capturing node names and transitions.

Safe to import even if langgraph is not installed.
"""

import functools
import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("agentstack.instruments.langgraph")

_original_invoke: Optional[Any] = None
_original_stream: Optional[Any] = None
_instrumented = False


def _extract_graph_info(graph: Any) -> Dict[str, Any]:
    """Extract metadata from a LangGraph CompiledGraph object."""
    info: Dict[str, Any] = {}
    try:
        # Capture node names from the graph's builder if available
        if hasattr(graph, "builder") and hasattr(graph.builder, "nodes"):
            node_names = list(graph.builder.nodes.keys())
            info["nodes"] = node_names[:20]  # Cap at 20 nodes
            info["node_count"] = len(node_names)

        # Capture graph name if available
        if hasattr(graph, "name"):
            info["graph_name"] = graph.name
        elif hasattr(graph, "builder") and hasattr(graph.builder, "name"):
            info["graph_name"] = graph.builder.name

        # Capture edges/transitions if available
        if hasattr(graph, "builder") and hasattr(graph.builder, "edges"):
            edges = graph.builder.edges
            edge_list: List[str] = []
            for edge in edges:
                if isinstance(edge, tuple) and len(edge) >= 2:
                    edge_list.append(f"{edge[0]} -> {edge[1]}")
            if edge_list:
                info["edges"] = edge_list[:30]  # Cap at 30 edges
    except Exception:
        logger.debug("Failed to extract LangGraph graph info", exc_info=True)

    return info


def _invoke_wrapper(original_fn: Any) -> Any:
    """Wrap CompiledGraph.invoke() to create a span for graph execution."""

    @functools.wraps(original_fn)
    def wrapper(self: Any, *args: Any, **kwargs: Any) -> Any:
        from agentstack.trace import get_current_session

        session = get_current_session()
        if session is None:
            return original_fn(self, *args, **kwargs)

        graph_info = _extract_graph_info(self)
        graph_name = graph_info.get("graph_name", "graph")

        input_summary: Dict[str, Any] = {**graph_info}

        # Capture input (first arg)
        if args:
            input_data = args[0]
            try:
                input_str = str(input_data)
                if len(input_str) > 500:
                    input_str = input_str[:500] + "...(truncated)"
                input_summary["input"] = input_str
            except Exception:
                pass

        # Capture config if present
        config = kwargs.get("config", None)
        if config and isinstance(config, dict):
            input_summary["config_keys"] = list(config.keys())[:10]

        span = session.span(
            name=f"langgraph.{graph_name}.invoke",
            span_type="chain",
        )

        with span:
            span.set_input(input_summary)

            start = time.time()
            result = original_fn(self, *args, **kwargs)
            latency_ms = (time.time() - start) * 1000

            span.set_metadata("latency_ms", round(latency_ms, 1))

            # Capture output
            try:
                if result is not None:
                    output_str = str(result)
                    if len(output_str) > 2000:
                        output_str = output_str[:2000] + "...(truncated)"
                    span.set_output(output_str)
            except Exception:
                pass

            return result

    return wrapper


def _stream_wrapper(original_fn: Any) -> Any:
    """Wrap CompiledGraph.stream() to create a span for graph streaming."""

    @functools.wraps(original_fn)
    def wrapper(self: Any, *args: Any, **kwargs: Any) -> Any:
        from agentstack.trace import get_current_session

        session = get_current_session()
        if session is None:
            return original_fn(self, *args, **kwargs)

        graph_info = _extract_graph_info(self)
        graph_name = graph_info.get("graph_name", "graph")

        input_summary: Dict[str, Any] = {**graph_info}

        if args:
            input_data = args[0]
            try:
                input_str = str(input_data)
                if len(input_str) > 500:
                    input_str = input_str[:500] + "...(truncated)"
                input_summary["input"] = input_str
            except Exception:
                pass

        span = session.span(
            name=f"langgraph.{graph_name}.stream",
            span_type="chain",
        )

        with span:
            span.set_input(input_summary)

            start = time.time()

            # Wrap the generator to track chunks
            original_gen = original_fn(self, *args, **kwargs)
            chunk_count = 0
            last_node: Optional[str] = None
            node_transitions: List[str] = []

            try:
                for chunk in original_gen:
                    chunk_count += 1
                    # Track node transitions if the chunk is a dict with node keys
                    try:
                        if isinstance(chunk, dict):
                            for key in chunk:
                                if key != last_node:
                                    node_transitions.append(key)
                                    last_node = key
                    except Exception:
                        pass
                    yield chunk
            finally:
                latency_ms = (time.time() - start) * 1000
                span.set_metadata("latency_ms", round(latency_ms, 1))
                span.set_metadata("chunk_count", chunk_count)
                if node_transitions:
                    span.set_metadata("node_transitions", node_transitions[:50])
                    span.set_output(f"Streamed {chunk_count} chunks through nodes: {' -> '.join(node_transitions[:20])}")

    return wrapper


def instrument() -> None:
    """
    Instrument the LangGraph library for automatic tracing.

    Monkey-patches langgraph.graph.state.CompiledStateGraph.invoke
    and .stream to automatically create spans.

    Raises:
        ImportError: If the langgraph library is not installed.
    """
    global _original_invoke, _original_stream, _instrumented

    if _instrumented:
        logger.debug("LangGraph already instrumented, skipping.")
        return

    try:
        from langgraph.graph.state import CompiledStateGraph
    except ImportError:
        raise ImportError(
            "The 'langgraph' package is required for LangGraph instrumentation. "
            "Install it with: pip install langgraph"
        )

    # Patch invoke
    _original_invoke = CompiledStateGraph.invoke
    CompiledStateGraph.invoke = _invoke_wrapper(_original_invoke)  # type: ignore

    # Patch stream
    _original_stream = CompiledStateGraph.stream
    CompiledStateGraph.stream = _stream_wrapper(_original_stream)  # type: ignore

    _instrumented = True
    logger.info("LangGraph auto-instrumentation enabled.")


def uninstrument() -> None:
    """Remove LangGraph instrumentation, restoring original methods."""
    global _original_invoke, _original_stream, _instrumented

    if not _instrumented:
        return

    try:
        from langgraph.graph.state import CompiledStateGraph

        if _original_invoke is not None:
            CompiledStateGraph.invoke = _original_invoke  # type: ignore
        if _original_stream is not None:
            CompiledStateGraph.stream = _original_stream  # type: ignore
    except ImportError:
        pass

    _original_invoke = None
    _original_stream = None
    _instrumented = False
    logger.info("LangGraph auto-instrumentation removed.")
