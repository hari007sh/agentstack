"""
AgentStack Shield — Self-Healing Engine for AI Agents

Provides automatic intervention for:
- Loop detection (repeated identical tool calls)
- Hallucination catching (calls to non-existent tools)
- Cost breaker (budget enforcement)
- Context overflow prevention (proactive summarization)
- Timeout recovery (retry + skip logic)
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
import hashlib
import json
import contextvars
import time
import logging

logger = logging.getLogger("agentstack.healing")

_healing_engine = contextvars.ContextVar('agentstack_healing', default=None)


def get_healing_engine() -> Optional['HealingEngine']:
    """Get the current HealingEngine from context, or None."""
    return _healing_engine.get(None)


def set_healing_engine(engine: Optional['HealingEngine']):
    """Set the current HealingEngine in context."""
    _healing_engine.set(engine)


@dataclass
class HealingConfig:
    """Configuration for the Shield self-healing engine."""
    enabled: bool = True
    loop_threshold: int = 3              # break after N identical tool calls
    cost_limit_cents: int = 500          # $5 default
    context_summarize_at: float = 0.8    # summarize at 80% context window
    timeout_seconds: int = 30
    timeout_retry: bool = True
    model_fallback: Optional[str] = None  # cheaper model on cost limit
    max_retries_per_step: int = 2


@dataclass
class HealingIntervention:
    """Record of a single healing intervention."""
    type: str  # loop_break, hallucination_catch, cost_breaker, context_overflow, timeout_recovery
    description: str
    action_taken: str
    original_call: dict
    result: str = "pending"
    saved_cost_estimate_cents: int = 0
    timestamp: float = field(default_factory=time.time)


class CostLimitExceeded(Exception):
    """Raised when agent cost exceeds the configured limit and no fallback model is set."""
    def __init__(self, current: int, limit: int):
        super().__init__(f"Cost ${current/100:.2f} >= ${limit/100:.2f}")
        self.current = current
        self.limit = limit


class HealingEngine:
    """
    Core Shield engine. Wraps tool calls and LLM interactions to detect and
    correct failure modes in real-time.

    Usage:
        config = HealingConfig(loop_threshold=3, cost_limit_cents=500)
        engine = HealingEngine(config, session)

        # Before each tool call
        correction = engine.before_tool_call("search", {"query": "foo"})
        if correction:
            # inject correction into agent prompt instead of executing tool
            pass

        # On tool error
        recovery = engine.on_tool_error("search", some_exception, available_tools=["search", "read"])
        if recovery:
            # inject recovery instruction
            pass

        # After each LLM call
        engine.update_cost(cost_cents=12, tokens=1500)
        summarize_instruction = engine.check_context(current_tokens=95000, max_tokens=128000)
    """

    def __init__(self, config: HealingConfig, session: Any):
        """
        Args:
            config: HealingConfig instance
            session: The AgentStack session object (must have add_event method)
        """
        self.config = config
        self.session = session
        self.call_history: List[Dict[str, Any]] = []
        self.total_cost_cents: int = 0
        self.total_tokens: int = 0
        self.interventions: List[HealingIntervention] = []
        self.retry_counts: Dict[str, int] = {}
        self._started_at = time.time()

    def _fingerprint(self, tool_name: str, params: dict) -> str:
        """Generate a deterministic hash of a tool call for duplicate detection."""
        raw = json.dumps({"tool": tool_name, "params": params}, sort_keys=True, default=str)
        return hashlib.md5(raw.encode()).hexdigest()

    def before_tool_call(self, tool_name: str, params: dict) -> Optional[str]:
        """
        Check a tool call before execution.

        Returns:
            None — proceed with the call normally.
            str  — a corrective instruction to inject into the agent prompt
                   instead of executing the tool.

        Raises:
            CostLimitExceeded — if cost limit hit and no fallback model configured.
        """
        if not self.config.enabled:
            return None

        fp = self._fingerprint(tool_name, params)

        # ── LOOP DETECTION ──
        identical = sum(1 for c in self.call_history if c['fp'] == fp)
        if identical >= self.config.loop_threshold:
            intervention = HealingIntervention(
                type="loop_break",
                description=f"Agent called '{tool_name}' {identical+1} times with identical params",
                action_taken="Injected corrective prompt",
                original_call={"tool": tool_name, "params": params},
                saved_cost_estimate_cents=identical * 5,
            )
            self.interventions.append(intervention)
            self.session.add_event("healing", "loop_break", {
                "tool": tool_name,
                "count": identical + 1,
            })
            logger.warning(
                "Shield: loop detected — %s called %d times with same params",
                tool_name, identical + 1,
            )
            return (
                f"You have called '{tool_name}' {identical+1} times with the same "
                f"parameters. Try a completely different approach or summarize what you have."
            )

        # ── COST CHECK ──
        if self.total_cost_cents >= self.config.cost_limit_cents:
            action = (
                "Switched to fallback model" if self.config.model_fallback else "Halted"
            )
            intervention = HealingIntervention(
                type="cost_breaker",
                description=(
                    f"Cost ${self.total_cost_cents/100:.2f} exceeded limit "
                    f"${self.config.cost_limit_cents/100:.2f}"
                ),
                action_taken=action,
                original_call={"tool": tool_name},
            )
            self.interventions.append(intervention)
            self.session.add_event("healing", "cost_breaker", {
                "cost": self.total_cost_cents,
                "limit": self.config.cost_limit_cents,
            })
            logger.warning(
                "Shield: cost breaker triggered — $%.2f >= $%.2f",
                self.total_cost_cents / 100, self.config.cost_limit_cents / 100,
            )
            if self.config.model_fallback:
                return (
                    f"BUDGET LIMIT REACHED. Switch to model "
                    f"'{self.config.model_fallback}' for all remaining operations."
                )
            raise CostLimitExceeded(self.total_cost_cents, self.config.cost_limit_cents)

        # ── RECORD CALL ──
        self.call_history.append({
            "tool": tool_name,
            "params": params,
            "fp": fp,
            "ts": time.time(),
        })
        return None

    def on_tool_error(
        self,
        tool_name: str,
        error: Exception,
        available_tools: Optional[List[str]] = None,
    ) -> Optional[str]:
        """
        Handle a tool execution error.

        Returns:
            None — re-raise the original error.
            str  — a recovery instruction to inject into the agent prompt.
        """
        if not self.config.enabled:
            return None

        err = str(error).lower()

        # ── HALLUCINATION GUARD ──
        hallucination_signals = [
            "not found", "does not exist", "no such",
            "unknown function", "invalid tool", "unrecognized",
        ]
        if any(s in err for s in hallucination_signals):
            key = f"hall:{tool_name}"
            self.retry_counts[key] = self.retry_counts.get(key, 0) + 1
            if self.retry_counts[key] > self.config.max_retries_per_step:
                return None  # exhausted retries, let error propagate
            intervention = HealingIntervention(
                type="hallucination_catch",
                description=f"Agent called non-existent tool '{tool_name}'",
                action_taken="Provided available tools list",
                original_call={"tool": tool_name, "error": str(error)},
            )
            self.interventions.append(intervention)
            self.session.add_event("healing", "hallucination_catch", {
                "tool": tool_name,
            })
            logger.warning("Shield: hallucination caught — tool '%s' does not exist", tool_name)
            tools_msg = f" Available tools: {available_tools}" if available_tools else ""
            return f"Error: '{tool_name}' does not exist.{tools_msg} Use only valid tools."

        # ── TIMEOUT RECOVERY ──
        timeout_signals = ["timeout", "timed out", "deadline exceeded"]
        if any(s in err for s in timeout_signals):
            key = f"timeout:{tool_name}"
            self.retry_counts[key] = self.retry_counts.get(key, 0) + 1
            if self.retry_counts[key] > 1 or not self.config.timeout_retry:
                intervention = HealingIntervention(
                    type="timeout_recovery",
                    description=f"Tool '{tool_name}' timed out after retry",
                    action_taken="Skipped tool, continuing without result",
                    original_call={"tool": tool_name},
                    result="skipped",
                )
                self.interventions.append(intervention)
                self.session.add_event("healing", "timeout_skip", {
                    "tool": tool_name,
                })
                logger.warning("Shield: timeout — skipping tool '%s'", tool_name)
                return f"'{tool_name}' is unavailable (timed out). Continue without it."
            self.session.add_event("healing", "timeout_retry", {
                "tool": tool_name,
            })
            logger.info("Shield: timeout — retrying tool '%s'", tool_name)
            return None  # let framework retry

        return None

    def check_context(self, current_tokens: int, max_tokens: int) -> Optional[str]:
        """
        Check if context window usage requires summarization.

        Returns:
            None — context usage is within safe limits.
            str  — a summarization instruction to inject.
        """
        if not self.config.enabled or max_tokens <= 0:
            return None

        ratio = current_tokens / max_tokens
        if ratio >= self.config.context_summarize_at:
            intervention = HealingIntervention(
                type="context_overflow",
                description=f"Context at {ratio:.0%} of {max_tokens} tokens",
                action_taken="Injected summarization instruction",
                original_call={
                    "current_tokens": current_tokens,
                    "max_tokens": max_tokens,
                },
            )
            self.interventions.append(intervention)
            self.session.add_event("healing", "context_overflow", {
                "ratio": round(ratio, 2),
            })
            logger.warning(
                "Shield: context at %.0f%% — injecting summarization", ratio * 100
            )
            return (
                "IMPORTANT: You are approaching the context limit. Summarize key "
                "findings concisely before continuing. Keep only essential information."
            )
        return None

    def update_cost(self, cost_cents: int, tokens: int) -> None:
        """Record cost and token usage from an LLM call."""
        self.total_cost_cents += cost_cents
        self.total_tokens += tokens

    def get_summary(self) -> dict:
        """Get a summary of all healing interventions for this session."""
        types = [
            "loop_break", "hallucination_catch", "cost_breaker",
            "context_overflow", "timeout_recovery",
        ]
        return {
            "total_interventions": len(self.interventions),
            "by_type": {
                t: sum(1 for i in self.interventions if i.type == t)
                for t in types
                if any(i.type == t for i in self.interventions)
            },
            "estimated_savings_cents": sum(
                i.saved_cost_estimate_cents for i in self.interventions
            ),
            "total_cost_cents": self.total_cost_cents,
            "total_tokens": self.total_tokens,
            "duration_seconds": round(time.time() - self._started_at, 2),
            "interventions": [
                {
                    "type": i.type,
                    "description": i.description,
                    "action_taken": i.action_taken,
                    "result": i.result,
                    "saved_cost_estimate_cents": i.saved_cost_estimate_cents,
                    "timestamp": i.timestamp,
                }
                for i in self.interventions
            ],
        }
