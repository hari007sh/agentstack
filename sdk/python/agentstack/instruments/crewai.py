"""
AgentStack Auto-Instrumentation for CrewAI

Monkey-patches CrewAI's Crew.kickoff() and Agent.execute_task() to
automatically create spans for each crew run and individual agent tasks,
capturing task descriptions, agent roles, and outputs.

Safe to import even if crewai is not installed.
"""

import functools
import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("agentstack.instruments.crewai")

_original_kickoff: Optional[Any] = None
_original_execute_task: Optional[Any] = None
_instrumented = False


def _kickoff_wrapper(original_fn: Any) -> Any:
    """Wrap Crew.kickoff() to create a top-level crew span."""

    @functools.wraps(original_fn)
    def wrapper(self: Any, *args: Any, **kwargs: Any) -> Any:
        from agentstack.trace import get_current_session

        session = get_current_session()
        if session is None:
            return original_fn(self, *args, **kwargs)

        # Build input summary from the crew object
        input_summary: Dict[str, Any] = {}
        try:
            if hasattr(self, "tasks") and self.tasks:
                input_summary["task_count"] = len(self.tasks)
                descriptions = []
                for t in self.tasks[:5]:  # Capture first 5 task descriptions
                    desc = getattr(t, "description", "")
                    if isinstance(desc, str) and len(desc) > 200:
                        desc = desc[:200] + "...(truncated)"
                    descriptions.append(desc)
                input_summary["task_descriptions"] = descriptions

            if hasattr(self, "agents") and self.agents:
                input_summary["agent_count"] = len(self.agents)
                roles = []
                for a in self.agents[:10]:
                    role = getattr(a, "role", "unknown")
                    roles.append(role)
                input_summary["agent_roles"] = roles

            if hasattr(self, "process"):
                input_summary["process"] = str(self.process)
        except Exception:
            logger.debug("Failed to extract CrewAI crew info", exc_info=True)

        span = session.span(
            name="crewai.crew.kickoff",
            span_type="agent",
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


def _execute_task_wrapper(original_fn: Any) -> Any:
    """Wrap Agent.execute_task() to create a span per agent task execution."""

    @functools.wraps(original_fn)
    def wrapper(self: Any, task: Any, *args: Any, **kwargs: Any) -> Any:
        from agentstack.trace import get_current_session

        session = get_current_session()
        if session is None:
            return original_fn(self, task, *args, **kwargs)

        # Build input summary
        input_summary: Dict[str, Any] = {}
        try:
            input_summary["agent_role"] = getattr(self, "role", "unknown")
            input_summary["agent_goal"] = getattr(self, "goal", "")

            task_desc = getattr(task, "description", "")
            if isinstance(task_desc, str) and len(task_desc) > 500:
                task_desc = task_desc[:500] + "...(truncated)"
            input_summary["task_description"] = task_desc

            expected_output = getattr(task, "expected_output", "")
            if isinstance(expected_output, str) and len(expected_output) > 200:
                expected_output = expected_output[:200] + "...(truncated)"
            input_summary["expected_output"] = expected_output

            # Capture tools if available
            tools = getattr(self, "tools", [])
            if tools:
                tool_names = []
                for t in tools[:10]:
                    name = getattr(t, "name", None) or getattr(t, "__name__", str(type(t).__name__))
                    tool_names.append(name)
                input_summary["tools"] = tool_names
        except Exception:
            logger.debug("Failed to extract CrewAI task info", exc_info=True)

        agent_role = getattr(self, "role", "agent")
        span = session.span(
            name=f"crewai.agent.{agent_role}",
            span_type="agent",
        )

        with span:
            span.set_input(input_summary)

            start = time.time()
            result = original_fn(self, task, *args, **kwargs)
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


def instrument() -> None:
    """
    Instrument the CrewAI library for automatic tracing.

    Monkey-patches crewai.Crew.kickoff and crewai.Agent.execute_task
    to automatically create spans.

    Raises:
        ImportError: If the crewai library is not installed.
    """
    global _original_kickoff, _original_execute_task, _instrumented

    if _instrumented:
        logger.debug("CrewAI already instrumented, skipping.")
        return

    try:
        from crewai import Crew, Agent
    except ImportError:
        raise ImportError(
            "The 'crewai' package is required for CrewAI instrumentation. "
            "Install it with: pip install crewai"
        )

    # Patch Crew.kickoff
    _original_kickoff = Crew.kickoff
    Crew.kickoff = _kickoff_wrapper(_original_kickoff)  # type: ignore

    # Patch Agent.execute_task
    _original_execute_task = Agent.execute_task
    Agent.execute_task = _execute_task_wrapper(_original_execute_task)  # type: ignore

    _instrumented = True
    logger.info("CrewAI auto-instrumentation enabled.")


def uninstrument() -> None:
    """Remove CrewAI instrumentation, restoring original methods."""
    global _original_kickoff, _original_execute_task, _instrumented

    if not _instrumented:
        return

    try:
        from crewai import Crew, Agent

        if _original_kickoff is not None:
            Crew.kickoff = _original_kickoff  # type: ignore
        if _original_execute_task is not None:
            Agent.execute_task = _original_execute_task  # type: ignore
    except ImportError:
        pass

    _original_kickoff = None
    _original_execute_task = None
    _instrumented = False
    logger.info("CrewAI auto-instrumentation removed.")
