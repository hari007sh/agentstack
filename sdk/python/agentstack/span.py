"""
AgentStack Span

Represents a single unit of work within a session — an LLM call,
tool invocation, retrieval step, or custom operation. Supports
context manager usage for automatic timing and error capture.
"""

import time
import uuid
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("agentstack.span")

# Valid span types
SPAN_TYPES = {"llm_call", "tool_call", "retrieval", "chain", "agent", "custom"}


class Span:
    """
    Tracks a single operation within an AgentStack session.

    Usage as context manager:
        with Span(session=session, name="gpt-4-call", span_type="llm_call") as span:
            span.set_input({"prompt": "Hello"})
            result = call_llm(...)
            span.set_output(result)
            span.set_tokens(100, 50)
            span.set_model("gpt-4", "openai")

    Manual usage:
        span = Span(session=session, name="search", span_type="tool_call")
        span.start()
        span.set_input(query)
        span.set_output(results)
        span.end()
    """

    def __init__(
        self,
        session: Any,
        name: str,
        span_type: str = "custom",
        parent_span_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """
        Args:
            session: The parent Session object.
            name: Human-readable name for this span.
            span_type: One of: llm_call, tool_call, retrieval, chain, agent, custom.
            parent_span_id: ID of the parent span for nested spans.
            metadata: Optional initial metadata dict.
        """
        if span_type not in SPAN_TYPES:
            logger.warning(
                "Unknown span_type '%s'. Valid types: %s. Defaulting to 'custom'.",
                span_type, SPAN_TYPES,
            )
            span_type = "custom"

        self.id: str = str(uuid.uuid4())
        self.session = session
        self.name: str = name
        self.span_type: str = span_type
        self.parent_span_id: Optional[str] = parent_span_id
        self.metadata: Dict[str, Any] = metadata or {}

        self.input_data: Optional[Any] = None
        self.output_data: Optional[Any] = None
        self.error: Optional[str] = None
        self.status: str = "pending"  # pending, running, completed, failed

        self.model: Optional[str] = None
        self.provider: Optional[str] = None
        self.input_tokens: int = 0
        self.output_tokens: int = 0
        self.cost_cents: int = 0

        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.duration_ms: Optional[float] = None

        self._children: List["Span"] = []

    def start(self) -> "Span":
        """Mark the span as started. Records start time."""
        self.start_time = time.time()
        self.status = "running"
        logger.debug("Span '%s' (%s) started [%s]", self.name, self.span_type, self.id)
        return self

    def end(self) -> "Span":
        """
        Mark the span as ended. Records end time and duration.
        Sends the span event to the session.
        """
        self.end_time = time.time()
        if self.start_time:
            self.duration_ms = (self.end_time - self.start_time) * 1000

        if self.error:
            self.status = "failed"
        elif self.status == "running":
            self.status = "completed"

        self._send_event()
        logger.debug(
            "Span '%s' ended [%s] — %s (%.1fms)",
            self.name, self.id, self.status,
            self.duration_ms or 0,
        )
        return self

    def set_input(self, data: Any) -> "Span":
        """
        Set the input data for this span.

        Args:
            data: The input (prompt, query, function args, etc.).
        """
        self.input_data = data
        return self

    def set_output(self, data: Any) -> "Span":
        """
        Set the output data for this span.

        Args:
            data: The output (response text, tool result, etc.).
        """
        self.output_data = data
        return self

    def set_error(self, error: Any) -> "Span":
        """
        Record an error on this span. Sets status to 'failed'.

        Args:
            error: The error (string or Exception).
        """
        self.error = str(error)
        self.status = "failed"
        return self

    def set_tokens(self, input_tokens: int, output_tokens: int) -> "Span":
        """
        Set token usage for this span.

        Args:
            input_tokens: Number of input/prompt tokens.
            output_tokens: Number of output/completion tokens.
        """
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        return self

    def set_model(self, model: str, provider: Optional[str] = None) -> "Span":
        """
        Set the model used for this span.

        Args:
            model: Model name (e.g., "gpt-4", "claude-3-opus").
            provider: Provider name (e.g., "openai", "anthropic").
        """
        self.model = model
        self.provider = provider
        return self

    def set_cost(self, cost_cents: int) -> "Span":
        """
        Set the cost for this span in cents.

        Args:
            cost_cents: Cost in cents (integer, never float).
        """
        self.cost_cents = cost_cents
        return self

    def set_metadata(self, key: str, value: Any) -> "Span":
        """
        Set a metadata key-value pair on this span.

        Args:
            key: Metadata key.
            value: Metadata value (must be JSON-serializable).
        """
        self.metadata[key] = value
        return self

    def child(
        self,
        name: str,
        span_type: str = "custom",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "Span":
        """
        Create a nested child span.

        Args:
            name: Name of the child span.
            span_type: Type of the child span.
            metadata: Optional metadata.

        Returns:
            A new Span with this span as its parent.
        """
        child_span = Span(
            session=self.session,
            name=name,
            span_type=span_type,
            parent_span_id=self.id,
            metadata=metadata,
        )
        self._children.append(child_span)
        return child_span

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the span to a dict for API transmission."""
        data: Dict[str, Any] = {
            "span_id": self.id,
            "session_id": self.session.id,
            "name": self.name,
            "span_type": self.span_type,
            "status": self.status,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_ms": self.duration_ms,
        }

        if self.parent_span_id:
            data["parent_span_id"] = self.parent_span_id
        if self.input_data is not None:
            data["input"] = self.input_data
        if self.output_data is not None:
            data["output"] = self.output_data
        if self.error:
            data["error"] = self.error
        if self.model:
            data["model"] = self.model
        if self.provider:
            data["provider"] = self.provider
        if self.input_tokens or self.output_tokens:
            data["tokens"] = {
                "input": self.input_tokens,
                "output": self.output_tokens,
                "total": self.input_tokens + self.output_tokens,
            }
        if self.cost_cents:
            data["cost_cents"] = self.cost_cents
        if self.metadata:
            data["metadata"] = self.metadata

        return data

    def _send_event(self) -> None:
        """Send the span data to the session for batched transmission."""
        try:
            self.session.add_event("span", self.span_type, self.to_dict())
        except Exception:
            logger.exception("Failed to send span event for '%s'", self.name)

    def __enter__(self) -> "Span":
        """Enter the span context — starts the span."""
        self.start()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        """Exit the span context — records error if any, then ends the span."""
        if exc_val is not None:
            self.set_error(exc_val)
        self.end()
        # Do not suppress exceptions
        return False

    def __repr__(self) -> str:
        return (
            f"<Span name={self.name!r} type={self.span_type!r} "
            f"status={self.status!r} id={self.id[:8]}...>"
        )
