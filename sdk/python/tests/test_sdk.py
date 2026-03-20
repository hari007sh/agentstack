"""
AgentStack Python SDK — Test Suite

Tests for core SDK functionality:
- Client initialization
- Session/span lifecycle
- @trace decorator
- Batch sender
- Healing engine (loop detection, cost breaker)
"""

import time
import threading
import pytest
from unittest.mock import MagicMock, patch, call

import agentstack
from agentstack.client import AgentStackClient
from agentstack.session import Session
from agentstack.span import Span
from agentstack.trace import trace, get_current_session, set_current_session, _safe_repr
from agentstack.batch import BatchSender
from agentstack.healing import (
    HealingConfig,
    HealingEngine,
    HealingIntervention,
    CostLimitExceeded,
    get_healing_engine,
    set_healing_engine,
)
from agentstack import guard, cost


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class MockClient:
    """A mock client that records events in memory instead of sending HTTP."""

    def __init__(self):
        self.events = []
        self.immediate_calls = []
        self._flushed = False

    def send_event(self, event):
        self.events.append(event)

    def send_immediate(self, path, data):
        self.immediate_calls.append((path, data))
        return {"ok": True}

    def flush(self):
        self._flushed = True

    def shutdown(self):
        pass


class MockSession:
    """A minimal mock session for testing HealingEngine in isolation."""

    def __init__(self):
        self.events = []

    def add_event(self, category, event_type, data):
        self.events.append({
            "category": category,
            "event_type": event_type,
            "data": data,
        })


# ===========================================================================
# CLIENT TESTS
# ===========================================================================

class TestClient:
    """Tests for AgentStackClient initialization and configuration."""

    def test_init_requires_api_key(self):
        """Client raises ValueError if api_key is empty."""
        with pytest.raises(ValueError, match="api_key is required"):
            AgentStackClient(api_key="")

    def test_init_with_valid_key(self):
        """Client initializes with a valid API key."""
        client = AgentStackClient(api_key="as_sk_test123")
        assert client.endpoint == "http://localhost:8080"
        client.shutdown()

    def test_init_custom_endpoint(self):
        """Client accepts a custom endpoint."""
        client = AgentStackClient(
            api_key="as_sk_test",
            endpoint="https://api.example.com",
        )
        assert client.endpoint == "https://api.example.com"
        client.shutdown()

    def test_init_strips_trailing_slash(self):
        """Client strips trailing slash from endpoint."""
        client = AgentStackClient(
            api_key="as_sk_test",
            endpoint="http://localhost:8080/",
        )
        assert client.endpoint == "http://localhost:8080"
        client.shutdown()


# ===========================================================================
# SESSION TESTS
# ===========================================================================

class TestSession:
    """Tests for Session lifecycle management."""

    def test_session_creation(self):
        """Session is created with correct initial state."""
        client = MockClient()
        sess = Session(client=client, agent_name="test-agent")

        assert sess.agent_name == "test-agent"
        assert sess.status == "pending"
        assert sess.id is not None
        assert len(sess.id) == 36  # UUID format

    def test_session_start(self):
        """Session start sends a session_start event."""
        client = MockClient()
        sess = Session(client=client, agent_name="test-agent")
        sess.start()

        assert sess.status == "running"
        assert sess.start_time is not None
        assert len(client.events) == 1
        assert client.events[0]["type"] == "session_start"
        assert client.events[0]["agent_name"] == "test-agent"

    def test_session_end(self):
        """Session end sends a session_end event with duration."""
        client = MockClient()
        sess = Session(client=client, agent_name="test-agent")
        sess.start()
        sess.end()

        assert sess.status == "completed"
        assert sess.end_time is not None
        assert sess.duration_ms is not None
        assert sess.duration_ms >= 0

        end_event = [e for e in client.events if e["type"] == "session_end"]
        assert len(end_event) == 1
        assert end_event[0]["status"] == "completed"

    def test_session_end_with_error(self):
        """Session end with error sets status to failed."""
        client = MockClient()
        sess = Session(client=client, agent_name="test-agent")
        sess.start()
        sess.end(error="Something went wrong")

        assert sess.status == "failed"
        assert sess.error == "Something went wrong"

    def test_session_context_manager(self):
        """Session works as a context manager."""
        client = MockClient()
        sess = Session(client=client, agent_name="test-agent")

        with sess:
            assert sess.status == "running"

        assert sess.status == "completed"
        assert len(client.events) >= 2  # start + end

    def test_session_context_manager_with_exception(self):
        """Session records error when exception occurs in context."""
        client = MockClient()
        sess = Session(client=client, agent_name="test-agent")

        with pytest.raises(ValueError):
            with sess:
                raise ValueError("test error")

        assert sess.status == "failed"
        assert sess.error == "test error"

    def test_session_metadata(self):
        """Session supports metadata."""
        client = MockClient()
        sess = Session(
            client=client,
            agent_name="test-agent",
            metadata={"version": "1.0"},
        )
        sess.set_metadata("env", "test")

        assert sess.metadata["version"] == "1.0"
        assert sess.metadata["env"] == "test"

    def test_session_tags(self):
        """Session supports tags."""
        client = MockClient()
        sess = Session(
            client=client,
            agent_name="test-agent",
            tags={"environment": "staging"},
        )
        assert sess.tags["environment"] == "staging"


# ===========================================================================
# SPAN TESTS
# ===========================================================================

class TestSpan:
    """Tests for Span tracking."""

    def setup_method(self):
        self.client = MockClient()
        self.session = Session(client=self.client, agent_name="test")

    def test_span_creation(self):
        """Span is created with correct initial state."""
        span = Span(session=self.session, name="test-span", span_type="llm_call")

        assert span.name == "test-span"
        assert span.span_type == "llm_call"
        assert span.status == "pending"
        assert span.id is not None

    def test_span_invalid_type_defaults_to_custom(self):
        """Span with invalid type defaults to 'custom'."""
        span = Span(session=self.session, name="test", span_type="invalid_type")
        assert span.span_type == "custom"

    def test_span_context_manager(self):
        """Span works as a context manager with auto timing."""
        span = Span(session=self.session, name="test-span", span_type="tool_call")

        with span:
            assert span.status == "running"
            assert span.start_time is not None
            span.set_output("result")

        assert span.status == "completed"
        assert span.end_time is not None
        assert span.duration_ms is not None
        assert span.duration_ms >= 0

    def test_span_context_manager_with_exception(self):
        """Span records error on exception in context."""
        span = Span(session=self.session, name="test-span")

        with pytest.raises(RuntimeError):
            with span:
                raise RuntimeError("span error")

        assert span.status == "failed"
        assert "span error" in span.error

    def test_span_set_input_output(self):
        """Span set_input and set_output work correctly."""
        span = Span(session=self.session, name="test")
        span.set_input({"prompt": "Hello"})
        span.set_output("World")

        assert span.input_data == {"prompt": "Hello"}
        assert span.output_data == "World"

    def test_span_set_tokens(self):
        """Span set_tokens records token usage."""
        span = Span(session=self.session, name="test")
        span.set_tokens(100, 50)

        assert span.input_tokens == 100
        assert span.output_tokens == 50

    def test_span_set_model(self):
        """Span set_model records model and provider."""
        span = Span(session=self.session, name="test")
        span.set_model("gpt-4", provider="openai")

        assert span.model == "gpt-4"
        assert span.provider == "openai"

    def test_span_set_metadata(self):
        """Span set_metadata records key-value pairs."""
        span = Span(session=self.session, name="test")
        span.set_metadata("key", "value")

        assert span.metadata["key"] == "value"

    def test_span_to_dict(self):
        """Span serializes to dict correctly."""
        span = Span(session=self.session, name="test-span", span_type="llm_call")
        span.start()
        span.set_input("hello")
        span.set_output("world")
        span.set_tokens(100, 50)
        span.set_model("gpt-4", "openai")
        span.set_cost(12)
        span.end()

        d = span.to_dict()
        assert d["name"] == "test-span"
        assert d["span_type"] == "llm_call"
        assert d["status"] == "completed"
        assert d["input"] == "hello"
        assert d["output"] == "world"
        assert d["tokens"]["input"] == 100
        assert d["tokens"]["output"] == 50
        assert d["model"] == "gpt-4"
        assert d["provider"] == "openai"
        assert d["cost_cents"] == 12

    def test_span_chaining(self):
        """Span methods support chaining."""
        span = Span(session=self.session, name="test")
        result = (
            span.set_input("in")
            .set_output("out")
            .set_tokens(10, 5)
            .set_model("gpt-4")
            .set_cost(1)
            .set_metadata("k", "v")
        )
        assert result is span

    def test_nested_spans(self):
        """Child spans have correct parent_span_id."""
        parent = Span(session=self.session, name="parent")
        child = parent.child("child", span_type="tool_call")

        assert child.parent_span_id == parent.id
        assert child.name == "child"
        assert child.span_type == "tool_call"

    def test_session_creates_spans(self):
        """Session.span() creates and tracks spans."""
        with self.session:
            span1 = self.session.span("step1", span_type="llm_call")
            span2 = self.session.span("step2", span_type="tool_call")

        assert len(self.session.spans) == 2
        assert self.session.spans[0].name == "step1"
        assert self.session.spans[1].name == "step2"


# ===========================================================================
# TRACE DECORATOR TESTS
# ===========================================================================

class TestTraceDecorator:
    """Tests for the @trace decorator."""

    def setup_method(self):
        self.client = MockClient()
        self.session = Session(client=self.client, agent_name="test")

    def test_trace_without_session(self):
        """@trace runs function normally without an active session."""

        @trace(span_type="tool_call")
        def my_func(x):
            return x * 2

        result = my_func(5)
        assert result == 10

    def test_trace_with_session(self):
        """@trace creates a span when a session is active."""

        @trace(name="multiply", span_type="tool_call")
        def my_func(x, y):
            return x * y

        set_current_session(self.session)
        self.session.start()

        result = my_func(3, 4)
        assert result == 12

        self.session.end()
        set_current_session(None)

        # Check that a span was created
        assert len(self.session.spans) == 1
        span = self.session.spans[0]
        assert span.name == "multiply"
        assert span.span_type == "tool_call"

    def test_trace_captures_input(self):
        """@trace captures function arguments as span input."""

        @trace(span_type="tool_call")
        def greet(name, greeting="Hello"):
            return f"{greeting}, {name}!"

        set_current_session(self.session)
        self.session.start()

        greet("World")

        self.session.end()
        set_current_session(None)

        span = self.session.spans[0]
        assert span.input_data["name"] == "World"
        assert span.input_data["greeting"] == "Hello"

    def test_trace_captures_output(self):
        """@trace captures function return value as span output."""

        @trace(span_type="tool_call")
        def compute():
            return {"result": 42}

        set_current_session(self.session)
        self.session.start()

        compute()

        self.session.end()
        set_current_session(None)

        span = self.session.spans[0]
        assert span.output_data == {"result": 42}

    def test_trace_captures_exception(self):
        """@trace records exceptions and marks span as failed."""

        @trace(span_type="tool_call")
        def failing_func():
            raise ValueError("oops")

        set_current_session(self.session)
        self.session.start()

        with pytest.raises(ValueError):
            failing_func()

        self.session.end()
        set_current_session(None)

        span = self.session.spans[0]
        assert span.status == "failed"
        assert "oops" in span.error

    def test_trace_uses_function_name_as_default(self):
        """@trace uses the function name as span name by default."""

        @trace(span_type="custom")
        def my_special_function():
            return True

        set_current_session(self.session)
        self.session.start()

        my_special_function()

        self.session.end()
        set_current_session(None)

        assert self.session.spans[0].name == "my_special_function"

    def test_trace_no_capture_input(self):
        """@trace with capture_input=False does not record input."""

        @trace(span_type="tool_call", capture_input=False)
        def secret_func(password):
            return True

        set_current_session(self.session)
        self.session.start()

        secret_func("s3cr3t")

        self.session.end()
        set_current_session(None)

        span = self.session.spans[0]
        assert span.input_data is None

    def test_trace_no_capture_output(self):
        """@trace with capture_output=False does not record output."""

        @trace(span_type="tool_call", capture_output=False)
        def get_token():
            return "secret_token"

        set_current_session(self.session)
        self.session.start()

        get_token()

        self.session.end()
        set_current_session(None)

        span = self.session.spans[0]
        assert span.output_data is None


# ===========================================================================
# BATCH SENDER TESTS
# ===========================================================================

class TestBatchSender:
    """Tests for the BatchSender."""

    def test_batch_sender_flushes_on_size(self):
        """BatchSender flushes when batch size is reached."""
        sent_batches = []

        def send_fn(events):
            sent_batches.append(list(events))

        sender = BatchSender(send_fn=send_fn, batch_size=5, flush_interval=60.0)
        sender.start()

        for i in range(5):
            sender.add({"id": i})

        # Give a moment for the flush to happen
        time.sleep(0.2)

        sender.shutdown()

        total_events = sum(len(b) for b in sent_batches)
        assert total_events == 5

    def test_batch_sender_flushes_on_interval(self):
        """BatchSender flushes at the time interval."""
        sent_batches = []

        def send_fn(events):
            sent_batches.append(list(events))

        sender = BatchSender(send_fn=send_fn, batch_size=1000, flush_interval=0.2)
        sender.start()

        sender.add({"id": 1})
        sender.add({"id": 2})

        # Wait for interval flush
        time.sleep(0.5)

        sender.shutdown()

        total_events = sum(len(b) for b in sent_batches)
        assert total_events == 2

    def test_batch_sender_graceful_shutdown(self):
        """BatchSender flushes remaining events on shutdown."""
        sent_batches = []

        def send_fn(events):
            sent_batches.append(list(events))

        sender = BatchSender(send_fn=send_fn, batch_size=100, flush_interval=60.0)
        sender.start()

        sender.add({"id": 1})
        sender.add({"id": 2})
        sender.add({"id": 3})

        sender.shutdown()

        total_events = sum(len(b) for b in sent_batches)
        assert total_events == 3

    def test_batch_sender_handles_send_error(self):
        """BatchSender handles send function errors gracefully."""
        call_count = 0

        def failing_send(events):
            nonlocal call_count
            call_count += 1
            raise ConnectionError("Network error")

        sender = BatchSender(send_fn=failing_send, batch_size=2, flush_interval=60.0)
        sender.start()

        sender.add({"id": 1})
        sender.add({"id": 2})

        time.sleep(0.2)
        sender.shutdown()

        # Should have attempted to send at least once
        assert call_count >= 1

    def test_batch_sender_thread_safety(self):
        """BatchSender handles concurrent adds safely."""
        sent_events = []
        lock = threading.Lock()

        def send_fn(events):
            with lock:
                sent_events.extend(events)

        sender = BatchSender(send_fn=send_fn, batch_size=50, flush_interval=60.0)
        sender.start()

        # Spawn multiple threads adding events
        threads = []
        events_per_thread = 20
        num_threads = 5

        def add_events(thread_id):
            for i in range(events_per_thread):
                sender.add({"thread": thread_id, "id": i})

        for t in range(num_threads):
            thread = threading.Thread(target=add_events, args=(t,))
            threads.append(thread)
            thread.start()

        for thread in threads:
            thread.join()

        sender.shutdown()

        assert len(sent_events) == num_threads * events_per_thread


# ===========================================================================
# HEALING ENGINE TESTS
# ===========================================================================

class TestHealingEngine:
    """Tests for the HealingEngine (Shield)."""

    def setup_method(self):
        self.mock_session = MockSession()

    def test_healing_engine_creation(self):
        """HealingEngine initializes with correct defaults."""
        config = HealingConfig()
        engine = HealingEngine(config=config, session=self.mock_session)

        assert engine.total_cost_cents == 0
        assert engine.total_tokens == 0
        assert len(engine.interventions) == 0
        assert len(engine.call_history) == 0

    def test_loop_detection(self):
        """HealingEngine detects loop after threshold identical calls."""
        config = HealingConfig(loop_threshold=3)
        engine = HealingEngine(config=config, session=self.mock_session)

        # First 3 calls should proceed normally
        for _ in range(3):
            result = engine.before_tool_call("search", {"query": "test"})
            assert result is None

        # 4th identical call should trigger loop break
        result = engine.before_tool_call("search", {"query": "test"})
        assert result is not None
        assert "4 times" in result
        assert "different approach" in result

        # Verify intervention was recorded
        assert len(engine.interventions) == 1
        assert engine.interventions[0].type == "loop_break"

        # Verify session event was recorded
        assert len(self.mock_session.events) == 1
        assert self.mock_session.events[0]["event_type"] == "loop_break"

    def test_loop_detection_different_params(self):
        """HealingEngine allows calls with different params."""
        config = HealingConfig(loop_threshold=2)
        engine = HealingEngine(config=config, session=self.mock_session)

        # Different params should not trigger loop
        for i in range(5):
            result = engine.before_tool_call("search", {"query": f"test_{i}"})
            assert result is None

        assert len(engine.interventions) == 0

    def test_cost_breaker_with_fallback(self):
        """HealingEngine switches to fallback model on cost limit."""
        config = HealingConfig(
            cost_limit_cents=100,
            model_fallback="gpt-4o-mini",
        )
        engine = HealingEngine(config=config, session=self.mock_session)

        # Exceed the cost limit
        engine.update_cost(cost_cents=150, tokens=5000)

        result = engine.before_tool_call("search", {"query": "test"})
        assert result is not None
        assert "gpt-4o-mini" in result
        assert "BUDGET LIMIT" in result

        assert len(engine.interventions) == 1
        assert engine.interventions[0].type == "cost_breaker"

    def test_cost_breaker_without_fallback(self):
        """HealingEngine raises CostLimitExceeded when no fallback."""
        config = HealingConfig(cost_limit_cents=100, model_fallback=None)
        engine = HealingEngine(config=config, session=self.mock_session)

        engine.update_cost(cost_cents=150, tokens=5000)

        with pytest.raises(CostLimitExceeded) as exc_info:
            engine.before_tool_call("search", {"query": "test"})

        assert exc_info.value.current == 150
        assert exc_info.value.limit == 100

    def test_hallucination_catch(self):
        """HealingEngine catches hallucinated tool calls."""
        config = HealingConfig()
        engine = HealingEngine(config=config, session=self.mock_session)

        error = Exception("Tool 'magic_tool' does not exist")
        result = engine.on_tool_error(
            "magic_tool",
            error,
            available_tools=["search", "read", "write"],
        )

        assert result is not None
        assert "does not exist" in result
        assert "search" in result
        assert len(engine.interventions) == 1
        assert engine.interventions[0].type == "hallucination_catch"

    def test_hallucination_retry_limit(self):
        """HealingEngine stops retrying after max retries."""
        config = HealingConfig(max_retries_per_step=2)
        engine = HealingEngine(config=config, session=self.mock_session)

        error = Exception("Tool not found")

        # First 2 attempts should provide recovery
        for _ in range(2):
            result = engine.on_tool_error("bad_tool", error)
            assert result is not None

        # 3rd attempt should give up
        result = engine.on_tool_error("bad_tool", error)
        assert result is None

    def test_timeout_recovery_retry(self):
        """HealingEngine retries on first timeout."""
        config = HealingConfig(timeout_retry=True)
        engine = HealingEngine(config=config, session=self.mock_session)

        error = Exception("Connection timed out")
        result = engine.on_tool_error("slow_tool", error)

        # First timeout should allow retry (returns None)
        assert result is None

    def test_timeout_recovery_skip(self):
        """HealingEngine skips tool after repeated timeouts."""
        config = HealingConfig(timeout_retry=True)
        engine = HealingEngine(config=config, session=self.mock_session)

        error = Exception("Connection timed out")

        # First timeout — retry
        engine.on_tool_error("slow_tool", error)

        # Second timeout — skip
        result = engine.on_tool_error("slow_tool", error)
        assert result is not None
        assert "unavailable" in result
        assert len(engine.interventions) == 1
        assert engine.interventions[0].type == "timeout_recovery"

    def test_context_overflow_detection(self):
        """HealingEngine detects context overflow at threshold."""
        config = HealingConfig(context_summarize_at=0.8)
        engine = HealingEngine(config=config, session=self.mock_session)

        # Below threshold — safe
        result = engine.check_context(current_tokens=70000, max_tokens=128000)
        assert result is None

        # At threshold — summarize
        result = engine.check_context(current_tokens=110000, max_tokens=128000)
        assert result is not None
        assert "context limit" in result.lower()
        assert "summarize" in result.lower()

    def test_context_overflow_zero_max(self):
        """HealingEngine handles zero max_tokens gracefully."""
        config = HealingConfig()
        engine = HealingEngine(config=config, session=self.mock_session)

        result = engine.check_context(current_tokens=100, max_tokens=0)
        assert result is None

    def test_healing_disabled(self):
        """HealingEngine does nothing when disabled."""
        config = HealingConfig(enabled=False, loop_threshold=1)
        engine = HealingEngine(config=config, session=self.mock_session)

        # Loop detection disabled
        for _ in range(10):
            result = engine.before_tool_call("search", {"query": "test"})
            assert result is None

        # Error handling disabled
        result = engine.on_tool_error("bad_tool", Exception("not found"))
        assert result is None

        # Context check disabled
        result = engine.check_context(100000, 100000)
        assert result is None

    def test_update_cost(self):
        """HealingEngine tracks cumulative cost and tokens."""
        config = HealingConfig()
        engine = HealingEngine(config=config, session=self.mock_session)

        engine.update_cost(cost_cents=10, tokens=500)
        engine.update_cost(cost_cents=20, tokens=1000)

        assert engine.total_cost_cents == 30
        assert engine.total_tokens == 1500

    def test_get_summary(self):
        """HealingEngine produces a correct summary."""
        config = HealingConfig(loop_threshold=2)
        engine = HealingEngine(config=config, session=self.mock_session)

        # Trigger a loop intervention
        engine.before_tool_call("search", {"query": "x"})
        engine.before_tool_call("search", {"query": "x"})
        engine.before_tool_call("search", {"query": "x"})  # triggers loop

        engine.update_cost(cost_cents=50, tokens=2000)

        summary = engine.get_summary()
        assert summary["total_interventions"] == 1
        assert summary["by_type"]["loop_break"] == 1
        assert summary["total_cost_cents"] == 50
        assert summary["total_tokens"] == 2000
        assert summary["duration_seconds"] >= 0
        assert len(summary["interventions"]) == 1

    def test_fingerprint_deterministic(self):
        """HealingEngine fingerprint is deterministic for same input."""
        config = HealingConfig()
        engine = HealingEngine(config=config, session=self.mock_session)

        fp1 = engine._fingerprint("tool", {"a": 1, "b": 2})
        fp2 = engine._fingerprint("tool", {"b": 2, "a": 1})  # different order
        fp3 = engine._fingerprint("tool", {"a": 1, "b": 3})  # different values

        assert fp1 == fp2  # same regardless of key order
        assert fp1 != fp3  # different for different params


# ===========================================================================
# GUARD STUB TESTS
# ===========================================================================

class TestGuard:
    """Tests for the guard module stub."""

    @pytest.mark.asyncio
    async def test_guard_check_returns_passed(self):
        """Guard check stub always returns passed=True."""
        result = await guard.check("some content", rules=["pii", "toxicity"])
        assert result["passed"] is True
        assert result["results"] == []

    def test_guard_check_sync_returns_passed(self):
        """Guard sync check stub always returns passed=True."""
        result = guard.check_sync("some content")
        assert result["passed"] is True


# ===========================================================================
# COST STUB TESTS
# ===========================================================================

class TestCost:
    """Tests for the cost module stub."""

    def test_cost_track_does_not_raise(self):
        """Cost track stub does not raise."""
        cost.track(model="gpt-4", input_tokens=100, output_tokens=50, cost_cents=12)

    def test_cost_check_budget_returns_true(self):
        """Cost check_budget stub always returns True."""
        assert cost.check_budget("budget_1", 100) is True

    def test_cost_get_budget_returns_none(self):
        """Cost get_budget stub returns None."""
        assert cost.get_budget("budget_1") is None


# ===========================================================================
# SAFE REPR TESTS
# ===========================================================================

class TestSafeRepr:
    """Tests for the _safe_repr utility."""

    def test_safe_repr_string_truncation(self):
        """Long strings are truncated."""
        long_string = "x" * 3000
        result = _safe_repr(long_string)
        assert len(result) < 3000
        assert "truncated" in result

    def test_safe_repr_none(self):
        """None passes through."""
        assert _safe_repr(None) is None

    def test_safe_repr_primitives(self):
        """Primitives pass through unchanged."""
        assert _safe_repr(42) == 42
        assert _safe_repr(3.14) == 3.14
        assert _safe_repr(True) is True
        assert _safe_repr("hello") == "hello"

    def test_safe_repr_dict(self):
        """Dicts are handled."""
        result = _safe_repr({"key": "value"})
        assert result == {"key": "value"}

    def test_safe_repr_non_serializable(self):
        """Non-serializable objects get a type name."""

        class Weird:
            def __str__(self):
                raise RuntimeError("cannot stringify")

        result = _safe_repr(Weird())
        assert "<Weird>" == result


# ===========================================================================
# INTEGRATION TEST
# ===========================================================================

class TestIntegration:
    """Integration tests combining multiple components."""

    def test_full_session_span_lifecycle(self):
        """Test a complete session with multiple spans."""
        client = MockClient()
        sess = Session(client=client, agent_name="integration-test")

        with sess:
            with sess.span("step1", span_type="llm_call") as span:
                span.set_input({"prompt": "Hello"})
                span.set_output("Hi there!")
                span.set_tokens(50, 20)
                span.set_model("gpt-4", "openai")
                span.set_cost(5)

            with sess.span("step2", span_type="tool_call") as span:
                span.set_input({"query": "search term"})
                span.set_output(["result1", "result2"])

        assert sess.status == "completed"
        assert len(sess.spans) == 2
        assert sess.total_tokens == 70  # 50+20 from step1
        assert sess.total_cost_cents == 5

    def test_trace_decorator_with_session(self):
        """Test @trace with an active session."""
        client = MockClient()
        sess = Session(client=client, agent_name="trace-test")

        @trace(name="add_numbers", span_type="tool_call")
        def add(a, b):
            return a + b

        set_current_session(sess)
        sess.start()

        result = add(3, 7)
        assert result == 10

        sess.end()
        set_current_session(None)

        assert len(sess.spans) == 1
        span = sess.spans[0]
        assert span.name == "add_numbers"
        assert span.status == "completed"
        assert span.input_data["a"] == 3
        assert span.input_data["b"] == 7
        assert span.output_data == 10

    def test_healing_with_session(self):
        """Test healing engine integration with a session."""
        client = MockClient()
        sess = Session(client=client, agent_name="healing-test")
        sess.start()

        config = HealingConfig(loop_threshold=2, cost_limit_cents=100)
        engine = HealingEngine(config=config, session=sess)

        # Normal call
        assert engine.before_tool_call("search", {"q": "a"}) is None
        assert engine.before_tool_call("search", {"q": "a"}) is None

        # Loop detected
        correction = engine.before_tool_call("search", {"q": "a"})
        assert correction is not None
        assert "3 times" in correction

        summary = engine.get_summary()
        assert summary["total_interventions"] == 1

        sess.end()
