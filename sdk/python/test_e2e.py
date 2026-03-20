#!/usr/bin/env python3
"""
AgentStack Python SDK — End-to-End Test

Tests the SDK against the running backend at http://localhost:8080
using a JWT token for authentication (DualAuth accepts both JWT and API keys).
"""

import sys
import time
import json
import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BACKEND_URL = "http://localhost:8080"
JWT_FILE = "/tmp/agentstack_jwt.txt"

# Read JWT token
try:
    with open(JWT_FILE, "r") as f:
        JWT_TOKEN = f.read().strip()
    print(f"[OK] Read JWT token from {JWT_FILE} ({len(JWT_TOKEN)} chars)")
except FileNotFoundError:
    print(f"[FAIL] JWT token file not found: {JWT_FILE}")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------
passed = 0
failed = 0


def check(name: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  [PASS] {name}")
    else:
        failed += 1
        msg = f"  [FAIL] {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)


# ---------------------------------------------------------------------------
# Step 0: Verify backend is reachable
# ---------------------------------------------------------------------------
print("\n=== Step 0: Verify backend ===")
try:
    resp = requests.get(f"{BACKEND_URL}/health", timeout=5)
    check("Backend health check", resp.status_code == 200, f"status={resp.status_code}")
    health = resp.json()
    check("Backend reports healthy", health.get("status") == "healthy", str(health))
except Exception as e:
    print(f"  [FAIL] Cannot reach backend: {e}")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Step 1: Initialize the SDK
# ---------------------------------------------------------------------------
print("\n=== Step 1: Initialize SDK ===")
import agentstack

try:
    agentstack.init(
        api_key=JWT_TOKEN,
        endpoint=BACKEND_URL,
        batch_size=10,
        flush_interval=1.0,
        debug=True,
    )
    check("agentstack.init() succeeded", True)
except Exception as e:
    check("agentstack.init()", False, str(e))
    sys.exit(1)

# ---------------------------------------------------------------------------
# Step 2: Create a session with spans
# ---------------------------------------------------------------------------
print("\n=== Step 2: Create session with spans ===")
session_id = None
try:
    with agentstack.session(
        agent_name="e2e-test-agent",
        metadata={"test": True, "version": "0.1.0"},
        tags={"env": "test", "suite": "e2e"},
    ) as sess:
        session_id = sess.id
        check("Session created", sess.id is not None, f"id={sess.id[:8]}...")
        check("Session status is running", sess.status == "running")

        # Span 1: LLM call
        with sess.span("gpt4-call", span_type="llm_call") as span1:
            span1.set_input({"prompt": "What is 2+2?", "model": "gpt-4"})
            time.sleep(0.05)  # simulate work
            span1.set_output("The answer is 4.")
            span1.set_tokens(25, 10)
            span1.set_model("gpt-4", provider="openai")
            span1.set_cost(3)
            span1.set_metadata("temperature", 0.7)
        check("Span 1 (llm_call) completed", span1.status == "completed")
        check("Span 1 has tokens", span1.input_tokens == 25 and span1.output_tokens == 10)
        check("Span 1 has duration", span1.duration_ms is not None and span1.duration_ms > 0)

        # Span 2: Tool call
        with sess.span("web-search", span_type="tool_call") as span2:
            span2.set_input({"query": "AgentStack documentation"})
            time.sleep(0.03)
            span2.set_output({"results": ["doc1.md", "doc2.md"]})
        check("Span 2 (tool_call) completed", span2.status == "completed")

        # Span 3: Retrieval
        with sess.span("vector-lookup", span_type="retrieval") as span3:
            span3.set_input("embeddings query")
            time.sleep(0.02)
            span3.set_output(["chunk1", "chunk2", "chunk3"])
            span3.set_tokens(50, 0)
            span3.set_cost(1)
        check("Span 3 (retrieval) completed", span3.status == "completed")

    check("Session ended successfully", sess.status == "completed")
    check("Session has 3 spans", len(sess.spans) == 3, f"got {len(sess.spans)}")
    check(
        "Session token total correct",
        sess.total_tokens == 85,
        f"expected 85, got {sess.total_tokens}",
    )
    check(
        "Session cost total correct",
        sess.total_cost_cents == 4,
        f"expected 4, got {sess.total_cost_cents}",
    )
    check("Session has duration", sess.duration_ms is not None and sess.duration_ms > 0)

except Exception as e:
    check("Session lifecycle", False, str(e))
    import traceback
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Step 3: Flush and verify data reached the backend
# ---------------------------------------------------------------------------
print("\n=== Step 3: Verify data in backend ===")
try:
    agentstack.flush()
    # Give the async pipeline a moment to process
    time.sleep(2.0)

    headers = {"Authorization": f"Bearer {JWT_TOKEN}"}

    # Check sessions list
    resp = requests.get(f"{BACKEND_URL}/v1/sessions", headers=headers, timeout=10)
    check("GET /v1/sessions returns 200", resp.status_code == 200, f"status={resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        sessions_list = data.get("sessions", [])
        our_session = None
        for s in sessions_list:
            if s.get("id") == session_id:
                our_session = s
                break

        check(
            "Our session found in backend",
            our_session is not None,
            f"searched for {session_id[:8]}... in {len(sessions_list)} sessions",
        )

        if our_session:
            check(
                "Session agent_name correct",
                our_session.get("agent_name") == "e2e-test-agent",
                f"got {our_session.get('agent_name')}",
            )
            check(
                "Session status in backend",
                our_session.get("status") in ("completed", "running"),
                f"got {our_session.get('status')}",
            )
            check(
                "Session has tokens",
                our_session.get("total_tokens", 0) > 0,
                f"got {our_session.get('total_tokens')}",
            )
            check(
                "Session has cost",
                our_session.get("total_cost_cents", 0) > 0,
                f"got {our_session.get('total_cost_cents')}",
            )
            check(
                "Session has spans count",
                our_session.get("total_spans", 0) > 0,
                f"got {our_session.get('total_spans')}",
            )
    else:
        check("Parse sessions response", False, resp.text[:200])

except Exception as e:
    check("Backend verification", False, str(e))
    import traceback
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Step 4: Test manual session lifecycle
# ---------------------------------------------------------------------------
print("\n=== Step 4: Manual session lifecycle ===")
try:
    manual_sess = agentstack.create_session(
        agent_name="manual-test-agent",
        metadata={"manual": True},
    )
    manual_sess.start()
    check("Manual session started", manual_sess.status == "running")

    span = manual_sess.span("step1", span_type="llm_call")
    with span:
        span.set_input("test input")
        span.set_output("test output")
        span.set_tokens(100, 50)
        span.set_cost(10)

    manual_sess.end()
    check("Manual session completed", manual_sess.status == "completed")
    check("Manual session has 1 span", len(manual_sess.spans) == 1)

except Exception as e:
    check("Manual session", False, str(e))
    import traceback
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Step 5: Test @trace decorator
# ---------------------------------------------------------------------------
print("\n=== Step 5: @trace decorator ===")
try:
    @agentstack.trace(name="decorated_func", span_type="tool_call")
    def my_tool(query: str) -> dict:
        return {"results": [query.upper()]}

    with agentstack.session(agent_name="trace-decorator-test") as trace_sess:
        result = my_tool("hello world")
        check("@trace decorated function returns correctly", result == {"results": ["HELLO WORLD"]})

    check("@trace session completed", trace_sess.status == "completed")
    check("@trace created span", len(trace_sess.spans) == 1)
    if trace_sess.spans:
        check("@trace span name", trace_sess.spans[0].name == "decorated_func")
        check("@trace span captured input", trace_sess.spans[0].input_data is not None)
        check("@trace span captured output", trace_sess.spans[0].output_data is not None)

except Exception as e:
    check("@trace decorator", False, str(e))
    import traceback
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Step 6: Test error handling in session
# ---------------------------------------------------------------------------
print("\n=== Step 6: Error handling ===")
try:
    try:
        with agentstack.session(agent_name="error-test-agent") as err_sess:
            with err_sess.span("failing-step", span_type="tool_call") as fail_span:
                fail_span.set_input("this will fail")
                raise RuntimeError("Simulated agent failure")
    except RuntimeError:
        pass  # Expected

    check("Error session status is failed", err_sess.status == "failed")
    check("Error session has error message", err_sess.error is not None and "Simulated" in err_sess.error)
    check("Error span status is failed", fail_span.status == "failed")
    check("Error span has error", fail_span.error is not None and "Simulated" in fail_span.error)

except Exception as e:
    check("Error handling", False, str(e))
    import traceback
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Step 7: Shutdown
# ---------------------------------------------------------------------------
print("\n=== Step 7: Shutdown ===")
try:
    agentstack.shutdown()
    check("SDK shutdown succeeded", True)
except Exception as e:
    check("SDK shutdown", False, str(e))

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print(f"\n{'='*60}")
print(f"E2E Test Results: {passed} passed, {failed} failed, {passed+failed} total")
print(f"{'='*60}")

sys.exit(0 if failed == 0 else 1)
