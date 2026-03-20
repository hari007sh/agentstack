# AgentStack — Core Platform (Trace + Shield)

This Mac builds the core AgentStack platform: observability (Trace) and self-healing (Shield).

## What Already Exists
- Go backend with ClickHouse, PostgreSQL, NATS, Redis
- Next.js dashboard
- Python + TypeScript SDKs with tracing
- Session/span/event ingestion and query APIs
- Failure pattern matching
- Alert system
- GitHub OAuth + API keys

## What To Build Now
1. Rename everything from AgentLens to AgentStack
2. Build Shield module (self-healing SDK — Python + TypeScript)
3. Build Healing Dashboard (ClickHouse tables, API, pages)
4. UI/UX Overhaul (dark theme, Framer Motion, redesign all pages)
5. Landing page

## Ports
- Go API: 8081
- Next.js: 3001
- PostgreSQL: 5433
- Redis: 6381
- ClickHouse: 9001
- NATS: 4223

---

# SPECIFICATION: Mac 1 — Core Trace + Shield

**Version:** 1.0
**Last Updated:** 2026-03-19
**Target:** Claude Code agent on Mac 1
**Prerequisite:** AgentLens Phase 1 fully built and functional

---

## TABLE OF CONTENTS

1. [Build Order](#build-order)
2. [Phase 1: Rename AgentLens to AgentStack](#phase-1-rename-agentlens-to-agentstack)
3. [Phase 2: Shield Module — Self-Healing SDK](#phase-2-shield-module--self-healing-sdk)
4. [Phase 3: Healing Dashboard — Backend](#phase-3-healing-dashboard--backend)
5. [Phase 4: UI/UX Overhaul](#phase-4-uiux-overhaul)
6. [Phase 5: Landing Page](#phase-5-landing-page)
7. [Testing & Validation](#testing--validation)

---

## BUILD ORDER

Execute these phases sequentially. Do NOT skip ahead. Each phase must compile/build cleanly before moving to the next.

```
Phase 1: Rename (AgentLens → AgentStack)          ~30 min
Phase 2: Shield Module (Python + TypeScript SDKs)  ~45 min
Phase 3: Healing Dashboard (ClickHouse + API + UI)  ~60 min
Phase 4: UI/UX Overhaul (dark theme, animations)    ~90 min
Phase 5: Landing Page                               ~45 min
```

---

## PHASE 1: RENAME AGENTLENS TO AGENTSTACK

### 1.1 Go Backend

#### 1.1.1 Rename the Go module

In `go.mod`, change:
```
module agentlens
```
to:
```
module agentstack
```

#### 1.1.2 Find and replace all Go imports

Run across every `.go` file in the project:

| Find | Replace |
|------|---------|
| `"agentlens/` | `"agentstack/` |
| `agentlens.` (in package references) | `agentstack.` |
| `AgentLens` (in string literals, comments, log messages) | `AgentStack` |
| `agentlens` (in string literals, comments, log messages) | `agentstack` |

#### 1.1.3 Rename API key prefix

Find all occurrences of the API key prefix and change:
```
al_sk_  →  as_sk_
```

This will appear in:
- API key generation functions (look for `"al_sk_"` string literal)
- API key validation/parsing functions
- Database seed data or migration files
- Any test files referencing API keys

Search patterns to find these:
```
grep -r "al_sk_" --include="*.go" .
```

Update the prefix constant or literal wherever it is defined. Typical location: `internal/auth/apikey.go` or `internal/models/apikey.go` or wherever API keys are generated.

#### 1.1.4 Rename environment variable prefixes (if any)

Search for any env vars prefixed with `AGENTLENS_` and rename to `AGENTSTACK_`:
```
AGENTLENS_DB_HOST  →  AGENTSTACK_DB_HOST
AGENTLENS_API_PORT →  AGENTSTACK_API_PORT
```
(Apply to all occurrences found.)

#### 1.1.5 Update Docker and config files

- `docker-compose.yml`: Rename service names from `agentlens-api` to `agentstack-api`, container names, image names, any labels
- `.env` / `.env.example`: Rename any `AGENTLENS_` prefixed variables
- `Dockerfile`: Update module path references, binary names
- `Makefile` (if exists): Update binary names, project references

#### 1.1.6 Verify Go build

```bash
cd /path/to/project
go build ./...
go vet ./...
```

Both must pass with zero errors.

---

### 1.2 Python SDK

#### 1.2.1 Rename package directory

```bash
mv sdk/python/agentlens sdk/python/agentstack
```

#### 1.2.2 Update `setup.py` or `pyproject.toml`

Change:
```python
name="agentlens"
```
to:
```python
name="agentstack"
```

Update all other references: description, URLs, package discovery paths.

#### 1.2.3 Update all internal imports

In every `.py` file under `sdk/python/`:

| Find | Replace |
|------|---------|
| `from agentlens` | `from agentstack` |
| `import agentlens` | `import agentstack` |
| `agentlens.` | `agentstack.` |
| `"agentlens"` | `"agentstack"` |
| `'agentlens'` | `'agentstack'` |
| `AgentLens` | `AgentStack` |
| `al_sk_` | `as_sk_` |

#### 1.2.4 Update `__init__.py`

Ensure the package `__init__.py` at `sdk/python/agentstack/__init__.py` has correct module name references.

#### 1.2.5 Verify Python package

```bash
cd sdk/python
pip install -e .
python -c "import agentstack; print('OK')"
```

---

### 1.3 TypeScript SDK

#### 1.3.1 Rename package

In `sdk/typescript/package.json`, change:
```json
"name": "@agentlens/sdk"
```
to:
```json
"name": "@agentstack/sdk"
```

#### 1.3.2 Update all TypeScript/JavaScript imports

In every `.ts` and `.tsx` file under `sdk/typescript/`:

| Find | Replace |
|------|---------|
| `@agentlens/sdk` | `@agentstack/sdk` |
| `agentlens` | `agentstack` |
| `AgentLens` | `AgentStack` |
| `al_sk_` | `as_sk_` |

#### 1.3.3 Verify TypeScript build

```bash
cd sdk/typescript
npm install
npm run build
```

---

### 1.4 Next.js Dashboard

#### 1.4.1 Update all references

In every file under `web/`:

| Find | Replace |
|------|---------|
| `AgentLens` | `AgentStack` |
| `agentlens` | `agentstack` |
| `@agentlens/sdk` | `@agentstack/sdk` |
| `al_sk_` | `as_sk_` |

#### 1.4.2 Update page titles and metadata

In `web/app/layout.tsx` (or wherever metadata is defined):
```tsx
export const metadata = {
  title: "AgentStack",
  description: "Observability and Self-Healing for AI Agents",
};
```

#### 1.4.3 Update `package.json`

Change the project name:
```json
"name": "agentstack-dashboard"
```

#### 1.4.4 Verify Next.js build

```bash
cd web
npm run build
```

Must complete with zero errors.

---

### 1.5 Post-Rename Checklist

- [ ] `go build ./...` passes
- [ ] `go vet ./...` passes
- [ ] Python SDK imports correctly
- [ ] TypeScript SDK builds correctly
- [ ] Next.js dashboard builds correctly
- [ ] No remaining occurrences of `agentlens` (case-insensitive) except in git history
- [ ] No remaining occurrences of `al_sk_` except in git history
- [ ] Docker compose starts all services

Run this final verification:
```bash
grep -ri "agentlens" --include="*.go" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.yaml" --include="*.yml" --include="*.toml" --include="*.cfg" --include="*.md" --include="*.html" --include="*.css" .
```
The ONLY matches should be in `CHANGELOG.md`, `git` history, or this spec file itself.

---

## PHASE 2: SHIELD MODULE — SELF-HEALING SDK

### 2.1 Python SDK — `sdk/python/agentstack/healing.py`

Create the file `sdk/python/agentstack/healing.py` with the following exact content:

```python
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

    def __init__(self, config: HealingConfig, session):
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

    def update_cost(self, cost_cents: int, tokens: int):
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
```

### 2.2 Integrate Healing into the Python `@trace` Decorator

Locate the existing `@trace` decorator (likely in `sdk/python/agentstack/tracing.py` or `sdk/python/agentstack/decorators.py`). Modify it as follows:

#### 2.2.1 Add healing parameters to `@trace`

```python
from agentstack.healing import HealingConfig, HealingEngine, set_healing_engine, get_healing_engine

def trace(
    name: str = None,
    session_tags: dict = None,
    # ... existing params ...
    healing: bool = False,
    healing_config: HealingConfig = None,
):
    """
    Decorator for tracing agent sessions with optional self-healing.

    Args:
        healing: Enable the Shield self-healing engine for this session.
        healing_config: Custom HealingConfig. If None and healing=True, uses defaults.
    """
    def decorator(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            session = _create_session(name or func.__name__, session_tags)
            engine = None
            if healing:
                cfg = healing_config or HealingConfig()
                engine = HealingEngine(cfg, session)
                set_healing_engine(engine)
            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                session.set_error(e)
                raise
            finally:
                if engine:
                    summary = engine.get_summary()
                    session.set_healing_summary(summary)
                    set_healing_engine(None)
                session.end()

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            session = _create_session(name or func.__name__, session_tags)
            engine = None
            if healing:
                cfg = healing_config or HealingConfig()
                engine = HealingEngine(cfg, session)
                set_healing_engine(engine)
            try:
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                session.set_error(e)
                raise
            finally:
                if engine:
                    summary = engine.get_summary()
                    session.set_healing_summary(summary)
                    set_healing_engine(None)
                session.end()

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    return decorator
```

#### 2.2.2 Add `set_healing_summary` to the Session class

Locate the Session class and add:

```python
def set_healing_summary(self, summary: dict):
    """Attach healing summary and send to server."""
    self._healing_summary = summary
    self._metadata["healing_enabled"] = True
    self._metadata["healing_interventions"] = summary["total_interventions"]
    self._metadata["healing_savings_cents"] = summary["estimated_savings_cents"]
    # Send each intervention as a healing event
    for intervention in summary["interventions"]:
        self.add_event("healing", intervention["type"], intervention)
```

#### 2.2.3 Add a `tool_call` wrapper utility

Create `sdk/python/agentstack/tools.py`:

```python
"""
AgentStack tool call wrapper with Shield integration.
"""

from typing import Callable, Any, Optional, List
import functools
import asyncio

from agentstack.healing import get_healing_engine


def tool(
    name: str = None,
    timeout: int = None,
):
    """
    Decorator to wrap a tool function with Shield healing checks.

    Usage:
        @tool(name="web_search")
        def search(query: str) -> str:
            return requests.get(f"https://api.search.com?q={query}").text
    """
    def decorator(func):
        tool_name = name or func.__name__

        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            engine = get_healing_engine()
            if engine:
                correction = engine.before_tool_call(tool_name, kwargs or _args_to_dict(args, func))
                if correction:
                    return correction  # return correction as the "result"
            try:
                if timeout:
                    result = await asyncio.wait_for(func(*args, **kwargs), timeout=timeout)
                else:
                    result = await func(*args, **kwargs)
                return result
            except Exception as e:
                if engine:
                    recovery = engine.on_tool_error(tool_name, e)
                    if recovery:
                        return recovery
                raise

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            engine = get_healing_engine()
            if engine:
                correction = engine.before_tool_call(tool_name, kwargs or _args_to_dict(args, func))
                if correction:
                    return correction
            try:
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                if engine:
                    recovery = engine.on_tool_error(tool_name, e)
                    if recovery:
                        return recovery
                raise

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    return decorator


def _args_to_dict(args, func) -> dict:
    """Convert positional args to a dict using function signature."""
    import inspect
    sig = inspect.signature(func)
    params = list(sig.parameters.keys())
    return {params[i]: args[i] for i in range(min(len(args), len(params)))}
```

#### 2.2.4 Update `sdk/python/agentstack/__init__.py`

Add these exports:

```python
from agentstack.healing import (
    HealingConfig,
    HealingEngine,
    HealingIntervention,
    CostLimitExceeded,
    get_healing_engine,
    set_healing_engine,
)
from agentstack.tools import tool
```

---

### 2.3 TypeScript SDK — `sdk/typescript/src/healing.ts`

Create the file `sdk/typescript/src/healing.ts` with this exact content:

```typescript
/**
 * AgentStack Shield — Self-Healing Engine for AI Agents (TypeScript)
 *
 * Provides automatic intervention for:
 * - Loop detection (repeated identical tool calls)
 * - Hallucination catching (calls to non-existent tools)
 * - Cost breaker (budget enforcement)
 * - Context overflow prevention (proactive summarization)
 * - Timeout recovery (retry + skip logic)
 */

import { createHash } from "crypto";
import { AsyncLocalStorage } from "async_hooks";

// ── Types ──

export interface HealingConfig {
  enabled: boolean;
  loopThreshold: number;          // break after N identical tool calls
  costLimitCents: number;         // default $5 = 500
  contextSummarizeAt: number;     // 0.8 = summarize at 80%
  timeoutSeconds: number;
  timeoutRetry: boolean;
  modelFallback: string | null;   // cheaper model on cost limit
  maxRetriesPerStep: number;
}

export const DEFAULT_HEALING_CONFIG: HealingConfig = {
  enabled: true,
  loopThreshold: 3,
  costLimitCents: 500,
  contextSummarizeAt: 0.8,
  timeoutSeconds: 30,
  timeoutRetry: true,
  modelFallback: null,
  maxRetriesPerStep: 2,
};

export interface HealingIntervention {
  type:
    | "loop_break"
    | "hallucination_catch"
    | "cost_breaker"
    | "context_overflow"
    | "timeout_recovery";
  description: string;
  actionTaken: string;
  originalCall: Record<string, unknown>;
  result: string;
  savedCostEstimateCents: number;
  timestamp: number;
}

export interface HealingSummary {
  totalInterventions: number;
  byType: Partial<Record<HealingIntervention["type"], number>>;
  estimatedSavingsCents: number;
  totalCostCents: number;
  totalTokens: number;
  durationSeconds: number;
  interventions: Array<{
    type: string;
    description: string;
    actionTaken: string;
    result: string;
    savedCostEstimateCents: number;
    timestamp: number;
  }>;
}

// ── Errors ──

export class CostLimitExceeded extends Error {
  current: number;
  limit: number;
  constructor(current: number, limit: number) {
    super(`Cost $${(current / 100).toFixed(2)} >= $${(limit / 100).toFixed(2)}`);
    this.name = "CostLimitExceeded";
    this.current = current;
    this.limit = limit;
  }
}

// ── Context ──

const healingStorage = new AsyncLocalStorage<HealingEngine>();

export function getHealingEngine(): HealingEngine | undefined {
  return healingStorage.getStore();
}

export function runWithHealing<T>(engine: HealingEngine, fn: () => T): T {
  return healingStorage.run(engine, fn);
}

// ── Session interface (minimal contract) ──

export interface HealingSession {
  addEvent(category: string, action: string, data: Record<string, unknown>): void;
}

// ── Engine ──

interface CallRecord {
  tool: string;
  params: Record<string, unknown>;
  fp: string;
  ts: number;
}

export class HealingEngine {
  readonly config: HealingConfig;
  private session: HealingSession;
  private callHistory: CallRecord[] = [];
  private _totalCostCents = 0;
  private _totalTokens = 0;
  private interventions: HealingIntervention[] = [];
  private retryCounts: Map<string, number> = new Map();
  private startedAt: number;

  constructor(config: Partial<HealingConfig>, session: HealingSession) {
    this.config = { ...DEFAULT_HEALING_CONFIG, ...config };
    this.session = session;
    this.startedAt = Date.now();
  }

  get totalCostCents(): number {
    return this._totalCostCents;
  }

  get totalTokens(): number {
    return this._totalTokens;
  }

  private fingerprint(toolName: string, params: Record<string, unknown>): string {
    const raw = JSON.stringify({ tool: toolName, params }, Object.keys({ tool: toolName, params }).sort());
    return createHash("md5").update(raw).digest("hex");
  }

  /**
   * Check a tool call before execution.
   * Returns null to proceed, or a corrective instruction string to inject.
   * Throws CostLimitExceeded if cost limit hit and no fallback model configured.
   */
  beforeToolCall(toolName: string, params: Record<string, unknown>): string | null {
    if (!this.config.enabled) return null;

    const fp = this.fingerprint(toolName, params);

    // ── LOOP DETECTION ──
    const identical = this.callHistory.filter((c) => c.fp === fp).length;
    if (identical >= this.config.loopThreshold) {
      this.interventions.push({
        type: "loop_break",
        description: `Agent called '${toolName}' ${identical + 1} times with identical params`,
        actionTaken: "Injected corrective prompt",
        originalCall: { tool: toolName, params },
        result: "pending",
        savedCostEstimateCents: identical * 5,
        timestamp: Date.now(),
      });
      this.session.addEvent("healing", "loop_break", {
        tool: toolName,
        count: identical + 1,
      });
      return (
        `You have called '${toolName}' ${identical + 1} times with the same ` +
        `parameters. Try a completely different approach or summarize what you have.`
      );
    }

    // ── COST CHECK ──
    if (this._totalCostCents >= this.config.costLimitCents) {
      const action = this.config.modelFallback
        ? "Switched to fallback model"
        : "Halted";
      this.interventions.push({
        type: "cost_breaker",
        description:
          `Cost $${(this._totalCostCents / 100).toFixed(2)} exceeded limit ` +
          `$${(this.config.costLimitCents / 100).toFixed(2)}`,
        actionTaken: action,
        originalCall: { tool: toolName },
        result: "pending",
        savedCostEstimateCents: 0,
        timestamp: Date.now(),
      });
      this.session.addEvent("healing", "cost_breaker", {
        cost: this._totalCostCents,
        limit: this.config.costLimitCents,
      });
      if (this.config.modelFallback) {
        return (
          `BUDGET LIMIT REACHED. Switch to model '${this.config.modelFallback}' ` +
          `for all remaining operations.`
        );
      }
      throw new CostLimitExceeded(this._totalCostCents, this.config.costLimitCents);
    }

    // ── RECORD CALL ──
    this.callHistory.push({
      tool: toolName,
      params,
      fp,
      ts: Date.now(),
    });
    return null;
  }

  /**
   * Handle a tool execution error.
   * Returns null to re-raise, or a recovery instruction string.
   */
  onToolError(
    toolName: string,
    error: Error,
    availableTools?: string[]
  ): string | null {
    if (!this.config.enabled) return null;

    const err = error.message.toLowerCase();

    // ── HALLUCINATION GUARD ──
    const hallucSignals = [
      "not found",
      "does not exist",
      "no such",
      "unknown function",
      "invalid tool",
      "unrecognized",
    ];
    if (hallucSignals.some((s) => err.includes(s))) {
      const key = `hall:${toolName}`;
      const count = (this.retryCounts.get(key) ?? 0) + 1;
      this.retryCounts.set(key, count);
      if (count > this.config.maxRetriesPerStep) return null;

      this.interventions.push({
        type: "hallucination_catch",
        description: `Agent called non-existent tool '${toolName}'`,
        actionTaken: "Provided available tools list",
        originalCall: { tool: toolName, error: error.message },
        result: "pending",
        savedCostEstimateCents: 0,
        timestamp: Date.now(),
      });
      this.session.addEvent("healing", "hallucination_catch", { tool: toolName });

      const toolsMsg = availableTools
        ? ` Available tools: ${JSON.stringify(availableTools)}`
        : "";
      return `Error: '${toolName}' does not exist.${toolsMsg} Use only valid tools.`;
    }

    // ── TIMEOUT RECOVERY ──
    const timeoutSignals = ["timeout", "timed out", "deadline exceeded"];
    if (timeoutSignals.some((s) => err.includes(s))) {
      const key = `timeout:${toolName}`;
      const count = (this.retryCounts.get(key) ?? 0) + 1;
      this.retryCounts.set(key, count);

      if (count > 1 || !this.config.timeoutRetry) {
        this.interventions.push({
          type: "timeout_recovery",
          description: `Tool '${toolName}' timed out after retry`,
          actionTaken: "Skipped tool, continuing without result",
          originalCall: { tool: toolName },
          result: "skipped",
          savedCostEstimateCents: 0,
          timestamp: Date.now(),
        });
        this.session.addEvent("healing", "timeout_skip", { tool: toolName });
        return `'${toolName}' is unavailable (timed out). Continue without it.`;
      }
      this.session.addEvent("healing", "timeout_retry", { tool: toolName });
      return null; // let framework retry
    }

    return null;
  }

  /**
   * Check if context window usage requires summarization.
   * Returns null if safe, or a summarization instruction string.
   */
  checkContext(currentTokens: number, maxTokens: number): string | null {
    if (!this.config.enabled || maxTokens <= 0) return null;

    const ratio = currentTokens / maxTokens;
    if (ratio >= this.config.contextSummarizeAt) {
      this.interventions.push({
        type: "context_overflow",
        description: `Context at ${Math.round(ratio * 100)}% of ${maxTokens} tokens`,
        actionTaken: "Injected summarization instruction",
        originalCall: { currentTokens, maxTokens },
        result: "pending",
        savedCostEstimateCents: 0,
        timestamp: Date.now(),
      });
      this.session.addEvent("healing", "context_overflow", {
        ratio: Math.round(ratio * 100) / 100,
      });
      return (
        "IMPORTANT: You are approaching the context limit. Summarize key " +
        "findings concisely before continuing. Keep only essential information."
      );
    }
    return null;
  }

  /** Record cost and token usage from an LLM call. */
  updateCost(costCents: number, tokens: number): void {
    this._totalCostCents += costCents;
    this._totalTokens += tokens;
  }

  /** Get a summary of all healing interventions for this session. */
  getSummary(): HealingSummary {
    const types: HealingIntervention["type"][] = [
      "loop_break",
      "hallucination_catch",
      "cost_breaker",
      "context_overflow",
      "timeout_recovery",
    ];
    const byType: Partial<Record<HealingIntervention["type"], number>> = {};
    for (const t of types) {
      const count = this.interventions.filter((i) => i.type === t).length;
      if (count > 0) byType[t] = count;
    }
    return {
      totalInterventions: this.interventions.length,
      byType,
      estimatedSavingsCents: this.interventions.reduce(
        (sum, i) => sum + i.savedCostEstimateCents,
        0
      ),
      totalCostCents: this._totalCostCents,
      totalTokens: this._totalTokens,
      durationSeconds: Math.round((Date.now() - this.startedAt) / 1000 * 100) / 100,
      interventions: this.interventions.map((i) => ({
        type: i.type,
        description: i.description,
        actionTaken: i.actionTaken,
        result: i.result,
        savedCostEstimateCents: i.savedCostEstimateCents,
        timestamp: i.timestamp,
      })),
    };
  }
}
```

#### 2.3.1 Update TypeScript SDK exports

In `sdk/typescript/src/index.ts`, add:

```typescript
export {
  HealingConfig,
  HealingEngine,
  HealingIntervention,
  HealingSummary,
  HealingSession,
  CostLimitExceeded,
  DEFAULT_HEALING_CONFIG,
  getHealingEngine,
  runWithHealing,
} from "./healing";
```

#### 2.3.2 Integrate healing into the TypeScript `trace` wrapper

Locate the existing `trace` function (likely in `sdk/typescript/src/tracing.ts`). Add healing support analogous to the Python version:

```typescript
import { HealingEngine, HealingConfig, DEFAULT_HEALING_CONFIG, runWithHealing } from "./healing";

interface TraceOptions {
  name?: string;
  tags?: Record<string, string>;
  // ... existing options ...
  healing?: boolean;
  healingConfig?: Partial<HealingConfig>;
}

export function trace(options: TraceOptions = {}) {
  return function <T extends (...args: any[]) => any>(fn: T): T {
    const wrapped = async function (this: any, ...args: any[]) {
      const session = createSession(options.name || fn.name, options.tags);
      let engine: HealingEngine | undefined;

      if (options.healing) {
        engine = new HealingEngine(
          options.healingConfig || {},
          session
        );
      }

      const execute = async () => {
        try {
          const result = await fn.apply(this, args);
          return result;
        } catch (e) {
          session.setError(e as Error);
          throw e;
        } finally {
          if (engine) {
            const summary = engine.getSummary();
            session.setHealingSummary(summary);
          }
          session.end();
        }
      };

      if (engine) {
        return runWithHealing(engine, execute);
      }
      return execute();
    };
    return wrapped as unknown as T;
  };
}
```

---

### 2.4 Phase 2 Verification

```bash
# Python
cd sdk/python
python -c "
from agentstack.healing import HealingConfig, HealingEngine, CostLimitExceeded
from agentstack.tools import tool
print('Python Shield: OK')
"

# TypeScript
cd sdk/typescript
npx tsc --noEmit
echo "TypeScript Shield: OK"
```

---

## PHASE 3: HEALING DASHBOARD — BACKEND

### 3.1 ClickHouse Schema

#### 3.1.1 Create migration file

Create a new migration file. If migrations are numbered, use the next number. If they use timestamps, use the current timestamp. The file should be placed alongside existing migrations (e.g., `migrations/clickhouse/` or `internal/database/migrations/`).

File: `migrations/clickhouse/NNNN_healing_events.up.sql` (replace NNNN with next number)

```sql
-- Healing events table
CREATE TABLE IF NOT EXISTS healing_events (
    id UUID DEFAULT generateUUIDv4(),
    session_id UUID,
    span_id Nullable(UUID),
    org_id UUID,
    healing_type Enum8(
        'loop_break' = 1,
        'hallucination_catch' = 2,
        'cost_breaker' = 3,
        'context_overflow' = 4,
        'timeout_recovery' = 5
    ),
    description String,
    action_taken String,
    original_call String DEFAULT '{}',
    result String DEFAULT 'pending',
    saved_cost_estimate_cents UInt64 DEFAULT 0,
    timestamp DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (org_id, session_id, timestamp);

-- Add healing columns to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS healing_enabled UInt8 DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS healing_interventions UInt32 DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS healing_savings_cents UInt64 DEFAULT 0;
```

Down migration file: `migrations/clickhouse/NNNN_healing_events.down.sql`

```sql
DROP TABLE IF EXISTS healing_events;

ALTER TABLE sessions DROP COLUMN IF EXISTS healing_enabled;
ALTER TABLE sessions DROP COLUMN IF EXISTS healing_interventions;
ALTER TABLE sessions DROP COLUMN IF EXISTS healing_savings_cents;
```

---

### 3.2 Go Backend — Healing Repository

#### 3.2.1 Create `internal/healing/repository.go`

```go
package healing

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/google/uuid"
)

type HealingEvent struct {
	ID                     uuid.UUID  `json:"id"`
	SessionID              uuid.UUID  `json:"session_id"`
	SpanID                 *uuid.UUID `json:"span_id,omitempty"`
	OrgID                  uuid.UUID  `json:"org_id"`
	HealingType            string     `json:"healing_type"`
	Description            string     `json:"description"`
	ActionTaken            string     `json:"action_taken"`
	OriginalCall           string     `json:"original_call"`
	Result                 string     `json:"result"`
	SavedCostEstimateCents uint64     `json:"saved_cost_estimate_cents"`
	Timestamp              time.Time  `json:"timestamp"`
}

type HealingAnalytics struct {
	Period               string `json:"period"`
	TotalInterventions   uint64 `json:"total_interventions"`
	LoopBreaks           uint64 `json:"loop_breaks"`
	HallucinationCatches uint64 `json:"hallucination_catches"`
	CostBreakers         uint64 `json:"cost_breakers"`
	ContextOverflows     uint64 `json:"context_overflows"`
	TimeoutRecoveries    uint64 `json:"timeout_recoveries"`
	TotalSavingsCents    uint64 `json:"total_savings_cents"`
}

type Repository struct {
	conn clickhouse.Conn
}

func NewRepository(conn clickhouse.Conn) *Repository {
	return &Repository{conn: conn}
}

func (r *Repository) InsertEvent(ctx context.Context, event *HealingEvent) error {
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now()
	}

	return r.conn.Exec(ctx, `
		INSERT INTO healing_events (
			id, session_id, span_id, org_id, healing_type,
			description, action_taken, original_call, result,
			saved_cost_estimate_cents, timestamp
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		event.ID, event.SessionID, event.SpanID, event.OrgID,
		event.HealingType, event.Description, event.ActionTaken,
		event.OriginalCall, event.Result, event.SavedCostEstimateCents,
		event.Timestamp,
	)
}

func (r *Repository) InsertBatch(ctx context.Context, events []*HealingEvent) error {
	batch, err := r.conn.PrepareBatch(ctx, `
		INSERT INTO healing_events (
			id, session_id, span_id, org_id, healing_type,
			description, action_taken, original_call, result,
			saved_cost_estimate_cents, timestamp
		)`,
	)
	if err != nil {
		return fmt.Errorf("prepare batch: %w", err)
	}
	for _, e := range events {
		if e.ID == uuid.Nil {
			e.ID = uuid.New()
		}
		if e.Timestamp.IsZero() {
			e.Timestamp = time.Now()
		}
		if err := batch.Append(
			e.ID, e.SessionID, e.SpanID, e.OrgID,
			e.HealingType, e.Description, e.ActionTaken,
			e.OriginalCall, e.Result, e.SavedCostEstimateCents,
			e.Timestamp,
		); err != nil {
			return fmt.Errorf("append: %w", err)
		}
	}
	return batch.Send()
}

func (r *Repository) GetBySession(ctx context.Context, orgID, sessionID uuid.UUID) ([]HealingEvent, error) {
	rows, err := r.conn.Query(ctx, `
		SELECT id, session_id, span_id, org_id, healing_type,
			description, action_taken, original_call, result,
			saved_cost_estimate_cents, timestamp
		FROM healing_events
		WHERE org_id = ? AND session_id = ?
		ORDER BY timestamp ASC`,
		orgID, sessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	var events []HealingEvent
	for rows.Next() {
		var e HealingEvent
		if err := rows.Scan(
			&e.ID, &e.SessionID, &e.SpanID, &e.OrgID,
			&e.HealingType, &e.Description, &e.ActionTaken,
			&e.OriginalCall, &e.Result, &e.SavedCostEstimateCents,
			&e.Timestamp,
		); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		events = append(events, e)
	}
	return events, nil
}

func (r *Repository) GetAnalytics(ctx context.Context, orgID uuid.UUID, from, to time.Time, granularity string) ([]HealingAnalytics, error) {
	var truncFunc string
	switch granularity {
	case "hour":
		truncFunc = "toStartOfHour(timestamp)"
	case "day":
		truncFunc = "toStartOfDay(timestamp)"
	case "week":
		truncFunc = "toStartOfWeek(timestamp)"
	case "month":
		truncFunc = "toStartOfMonth(timestamp)"
	default:
		truncFunc = "toStartOfDay(timestamp)"
	}

	query := fmt.Sprintf(`
		SELECT
			toString(%s) as period,
			count() as total_interventions,
			countIf(healing_type = 'loop_break') as loop_breaks,
			countIf(healing_type = 'hallucination_catch') as hallucination_catches,
			countIf(healing_type = 'cost_breaker') as cost_breakers,
			countIf(healing_type = 'context_overflow') as context_overflows,
			countIf(healing_type = 'timeout_recovery') as timeout_recoveries,
			sum(saved_cost_estimate_cents) as total_savings_cents
		FROM healing_events
		WHERE org_id = ? AND timestamp >= ? AND timestamp <= ?
		GROUP BY period
		ORDER BY period ASC`,
		truncFunc,
	)

	rows, err := r.conn.Query(ctx, query, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	var analytics []HealingAnalytics
	for rows.Next() {
		var a HealingAnalytics
		if err := rows.Scan(
			&a.Period, &a.TotalInterventions,
			&a.LoopBreaks, &a.HallucinationCatches,
			&a.CostBreakers, &a.ContextOverflows,
			&a.TimeoutRecoveries, &a.TotalSavingsCents,
		); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		analytics = append(analytics, a)
	}
	return analytics, nil
}

func (r *Repository) GetTotals(ctx context.Context, orgID uuid.UUID, from, to time.Time) (*HealingAnalytics, error) {
	var a HealingAnalytics
	err := r.conn.QueryRow(ctx, `
		SELECT
			'total' as period,
			count() as total_interventions,
			countIf(healing_type = 'loop_break') as loop_breaks,
			countIf(healing_type = 'hallucination_catch') as hallucination_catches,
			countIf(healing_type = 'cost_breaker') as cost_breakers,
			countIf(healing_type = 'context_overflow') as context_overflows,
			countIf(healing_type = 'timeout_recovery') as timeout_recoveries,
			sum(saved_cost_estimate_cents) as total_savings_cents
		FROM healing_events
		WHERE org_id = ? AND timestamp >= ? AND timestamp <= ?`,
		orgID, from, to,
	).Scan(
		&a.Period, &a.TotalInterventions,
		&a.LoopBreaks, &a.HallucinationCatches,
		&a.CostBreakers, &a.ContextOverflows,
		&a.TimeoutRecoveries, &a.TotalSavingsCents,
	)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	return &a, nil
}

// UpdateSessionHealing updates the healing columns on the sessions table.
func (r *Repository) UpdateSessionHealing(ctx context.Context, orgID, sessionID uuid.UUID, interventions uint32, savingsCents uint64) error {
	return r.conn.Exec(ctx, `
		ALTER TABLE sessions UPDATE
			healing_enabled = 1,
			healing_interventions = ?,
			healing_savings_cents = ?
		WHERE org_id = ? AND id = ?`,
		interventions, savingsCents, orgID, sessionID,
	)
}
```

#### 3.2.2 Create `internal/healing/handler.go`

```go
package healing

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Post("/v1/ingest/healing", h.IngestHealing)
	r.Get("/v1/analytics/healing", h.GetHealingAnalytics)
	r.Get("/v1/sessions/{sessionID}/healing", h.GetSessionHealing)
}

// IngestHealing handles POST /v1/ingest/healing
func (h *Handler) IngestHealing(w http.ResponseWriter, r *http.Request) {
	orgID, ok := getOrgIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		SessionID   uuid.UUID `json:"session_id"`
		SpanID      *uuid.UUID `json:"span_id,omitempty"`
		Events      []struct {
			HealingType            string `json:"healing_type"`
			Description            string `json:"description"`
			ActionTaken            string `json:"action_taken"`
			OriginalCall           string `json:"original_call"`
			Result                 string `json:"result"`
			SavedCostEstimateCents uint64 `json:"saved_cost_estimate_cents"`
			Timestamp              *time.Time `json:"timestamp,omitempty"`
		} `json:"events"`
		// Session-level summary fields
		TotalInterventions uint32 `json:"total_interventions"`
		TotalSavingsCents  uint64 `json:"total_savings_cents"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}

	if req.SessionID == uuid.Nil {
		http.Error(w, `{"error":"session_id required"}`, http.StatusBadRequest)
		return
	}

	// Insert individual events
	var events []*HealingEvent
	for _, e := range req.Events {
		ts := time.Now()
		if e.Timestamp != nil {
			ts = *e.Timestamp
		}
		events = append(events, &HealingEvent{
			SessionID:              req.SessionID,
			SpanID:                 req.SpanID,
			OrgID:                  orgID,
			HealingType:            e.HealingType,
			Description:            e.Description,
			ActionTaken:            e.ActionTaken,
			OriginalCall:           e.OriginalCall,
			Result:                 e.Result,
			SavedCostEstimateCents: e.SavedCostEstimateCents,
			Timestamp:              ts,
		})
	}

	if len(events) > 0 {
		if err := h.repo.InsertBatch(r.Context(), events); err != nil {
			http.Error(w, `{"error":"failed to insert healing events"}`, http.StatusInternalServerError)
			return
		}
	}

	// Update session healing columns
	if req.TotalInterventions > 0 {
		if err := h.repo.UpdateSessionHealing(r.Context(), orgID, req.SessionID, req.TotalInterventions, req.TotalSavingsCents); err != nil {
			// Log but don't fail the request
			_ = err
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "ok",
		"ingested": len(events),
	})
}

// GetHealingAnalytics handles GET /v1/analytics/healing?from=&to=&granularity=day
func (h *Handler) GetHealingAnalytics(w http.ResponseWriter, r *http.Request) {
	orgID, ok := getOrgIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	from, to, granularity := parseTimeRange(r)

	analytics, err := h.repo.GetAnalytics(r.Context(), orgID, from, to, granularity)
	if err != nil {
		http.Error(w, `{"error":"failed to query analytics"}`, http.StatusInternalServerError)
		return
	}

	totals, err := h.repo.GetTotals(r.Context(), orgID, from, to)
	if err != nil {
		http.Error(w, `{"error":"failed to query totals"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"totals":      totals,
		"timeseries":  analytics,
		"granularity": granularity,
	})
}

// GetSessionHealing handles GET /v1/sessions/{sessionID}/healing
func (h *Handler) GetSessionHealing(w http.ResponseWriter, r *http.Request) {
	orgID, ok := getOrgIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	sessionIDStr := chi.URLParam(r, "sessionID")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid session_id"}`, http.StatusBadRequest)
		return
	}

	events, err := h.repo.GetBySession(r.Context(), orgID, sessionID)
	if err != nil {
		http.Error(w, `{"error":"failed to query healing events"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"session_id": sessionID,
		"events":     events,
		"count":      len(events),
	})
}

// ── Helper functions ──
// These should match the patterns used in existing handlers.

func getOrgIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	// ADAPT THIS: Use the same pattern as existing handlers to extract orgID
	// from the authenticated request context. Look at existing handler files
	// for the exact implementation (e.g., internal/auth/middleware.go).
	//
	// Example pattern:
	//   orgID, ok := ctx.Value("org_id").(uuid.UUID)
	//   return orgID, ok
	//
	// Replace this with the actual implementation from your codebase.
	orgID, ok := ctx.Value("org_id").(uuid.UUID)
	return orgID, ok
}

func parseTimeRange(r *http.Request) (from, to time.Time, granularity string) {
	granularity = r.URL.Query().Get("granularity")
	if granularity == "" {
		granularity = "day"
	}

	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")

	from, err := time.Parse(time.RFC3339, fromStr)
	if err != nil {
		from = time.Now().AddDate(0, 0, -7) // default: last 7 days
	}
	to, err = time.Parse(time.RFC3339, toStr)
	if err != nil {
		to = time.Now()
	}

	return from, to, granularity
}
```

#### 3.2.3 Wire into the main router

Find the main router setup (likely `internal/server/router.go` or `cmd/api/main.go`). Add:

```go
import "agentstack/internal/healing"

// In the router setup function, after existing route registrations:
healingRepo := healing.NewRepository(clickhouseConn)
healingHandler := healing.NewHandler(healingRepo)
healingHandler.RegisterRoutes(r)
```

**IMPORTANT:** Use the same `clickhouseConn` variable/accessor that existing ClickHouse repositories use. Look at how existing repositories (e.g., sessions, spans, events) get their connection and follow the same pattern exactly.

Also adapt `getOrgIDFromContext` in `handler.go` to match whatever pattern the existing codebase uses for extracting the authenticated organization from request context.

---

### 3.3 Phase 3 Verification

```bash
# Run migration
# Use whatever migration tool the project uses (golang-migrate, goose, or manual)
# If manual, connect to ClickHouse and run the SQL directly

# Build
go build ./...
go vet ./...

# Start the server and test endpoints
curl -X POST http://localhost:8081/v1/ingest/healing \
  -H "Authorization: Bearer as_sk_test" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "00000000-0000-0000-0000-000000000001",
    "events": [{
      "healing_type": "loop_break",
      "description": "test",
      "action_taken": "test",
      "result": "resolved"
    }],
    "total_interventions": 1,
    "total_savings_cents": 5
  }'

curl http://localhost:8081/v1/analytics/healing \
  -H "Authorization: Bearer as_sk_test"

curl http://localhost:8081/v1/sessions/00000000-0000-0000-0000-000000000001/healing \
  -H "Authorization: Bearer as_sk_test"
```

---

## PHASE 4: UI/UX OVERHAUL

### 4.1 Install Dependencies

```bash
cd web
npm install framer-motion lucide-react
```

### 4.2 Design System — `web/app/globals.css`

Add the following CSS custom properties and utility classes to the existing `globals.css`. Do NOT remove existing styles — add to them.

```css
/* ─── AgentStack Design System ─── */

:root {
  /* Core palette */
  --bg-primary: #0a0a0b;
  --bg-secondary: #111113;
  --bg-elevated: #1e1e22;
  --bg-hover: #27272b;

  /* Borders */
  --border-default: #2a2a2e;
  --border-hover: #3a3a3e;
  --border-active: #4a4a4e;

  /* Text */
  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-tertiary: #71717a;
  --text-muted: #52525b;

  /* Status colors */
  --status-success: #22c55e;
  --status-error: #ef4444;
  --status-warning: #f59e0b;
  --status-info: #3b82f6;
  --status-running: #3b82f6;

  /* Healing (Shield) colors */
  --healing-primary: #38bdf8;
  --healing-glow: rgba(56, 189, 248, 0.15);
  --healing-border: rgba(56, 189, 248, 0.3);
  --healing-text: #7dd3fc;

  /* Accents */
  --accent-primary: #6366f1;
  --accent-primary-hover: #818cf8;
  --accent-secondary: #8b5cf6;

  /* Semantic */
  --card-bg: var(--bg-secondary);
  --card-border: var(--border-default);
  --sidebar-bg: var(--bg-primary);
  --sidebar-width: 220px;
  --sidebar-collapsed-width: 56px;
}

/* Font stacks */
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

code, pre, .font-mono {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}

/* ─── Utility Classes ─── */

/* Status dots */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.status-dot--completed { background-color: var(--status-success); }
.status-dot--failed { background-color: var(--status-error); }
.status-dot--running {
  background-color: var(--status-running);
  animation: pulse-dot 2s ease-in-out infinite;
}
.status-dot--timeout { background-color: var(--status-warning); }
.status-dot--healed {
  background-color: var(--healing-primary);
  animation: pulse-dot 2s ease-in-out infinite;
  box-shadow: 0 0 8px var(--healing-glow);
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
}

/* Healing glow effect */
.healing-glow {
  box-shadow: 0 0 20px var(--healing-glow), 0 0 40px rgba(56, 189, 248, 0.05);
  border-color: var(--healing-border);
}

/* Card */
.card {
  background-color: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 24px;
}

.card:hover {
  border-color: var(--border-hover);
}

/* Skeleton loading */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-elevated) 0%,
    var(--bg-hover) 50%,
    var(--bg-elevated) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  border-radius: 6px;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Table styles */
.table-row {
  border-bottom: 1px solid var(--border-default);
  transition: background-color 0.15s ease;
}

.table-row:hover {
  background-color: var(--bg-hover);
}

/* Healing intervention marker (for timeline) */
.healing-marker {
  width: 12px;
  height: 12px;
  transform: rotate(45deg);
  background-color: var(--healing-primary);
  box-shadow: 0 0 12px var(--healing-glow);
  position: absolute;
}

/* Button scale */
.btn-press {
  transition: transform 0.1s ease, background-color 0.15s ease;
}
.btn-press:active {
  transform: scale(0.97);
}

/* Backdrop blur for modals */
.modal-backdrop {
  backdrop-filter: blur(8px);
  background-color: rgba(0, 0, 0, 0.6);
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--border-hover);
}
```

### 4.3 Animation Utilities — `web/lib/animations.ts`

Create this file:

```typescript
/**
 * AgentStack Animation Utilities
 * Framer Motion variants and helpers.
 */

import { Variants, Transition } from "framer-motion";

// ── Fade In ──

export const fadeIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// ── Stagger Container ──

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" },
  },
};

// ── Scale In ──

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// ── Pulse Glow (for healing elements) ──

export const pulseGlow: Variants = {
  idle: {
    boxShadow: "0 0 10px rgba(56, 189, 248, 0.1)",
  },
  pulse: {
    boxShadow: [
      "0 0 10px rgba(56, 189, 248, 0.1)",
      "0 0 25px rgba(56, 189, 248, 0.3)",
      "0 0 10px rgba(56, 189, 248, 0.1)",
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// ── Slide In ──

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// ── Smooth spring transition ──

export const springTransition: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};

// ── Count-up animation hook data ──

export interface CountUpOptions {
  from?: number;
  to: number;
  duration?: number; // seconds
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

/**
 * Returns an array of frames for a count-up animation.
 * Use with Framer Motion's useMotionValue + useTransform, or a simple
 * requestAnimationFrame loop.
 *
 * For a React hook implementation, see useCountUp below.
 */
export function generateCountUpFrames(
  to: number,
  from: number = 0,
  steps: number = 60
): number[] {
  const frames: number[] = [];
  for (let i = 0; i <= steps; i++) {
    // Ease-out cubic
    const t = i / steps;
    const eased = 1 - Math.pow(1 - t, 3);
    frames.push(Math.round(from + (to - from) * eased));
  }
  return frames;
}
```

### 4.4 Count-Up Hook — `web/hooks/useCountUp.ts`

Create this file:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";

interface UseCountUpOptions {
  end: number;
  start?: number;
  duration?: number; // ms
  decimals?: number;
  enabled?: boolean;
}

export function useCountUp({
  end,
  start = 0,
  duration = 1200,
  decimals = 0,
  enabled = true,
}: UseCountUpOptions): string {
  const [value, setValue] = useState(start);
  const rafRef = useRef<number>();
  const startTimeRef = useRef<number>();

  useEffect(() => {
    if (!enabled) {
      setValue(end);
      return;
    }

    startTimeRef.current = undefined;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(start + (end - start) * eased);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [end, start, duration, enabled]);

  return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
}
```

### 4.5 Skeleton Component — `web/components/ui/skeleton.tsx`

Create this file (or update if it exists):

```tsx
"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton", className)}
      style={{ width, height }}
    />
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="card space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="table-row flex items-center gap-4 px-4 py-3">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  );
}
```

### 4.6 Metric Card Component — `web/components/ui/metric-card.tsx`

Create this file:

```tsx
"use client";

import { motion } from "framer-motion";
import { scaleIn } from "@/lib/animations";
import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  change?: number; // percentage change
  icon?: LucideIcon;
  variant?: "default" | "healing";
  sparklineData?: number[];
}

export function MetricCard({
  title,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  change,
  icon: Icon,
  variant = "default",
  sparklineData,
}: MetricCardProps) {
  const displayValue = useCountUp({ end: value, decimals });

  return (
    <motion.div
      variants={scaleIn}
      initial="hidden"
      animate="visible"
      className={cn(
        "card group cursor-default transition-all duration-200",
        variant === "healing" && "healing-glow"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          {title}
        </span>
        {Icon && (
          <Icon
            size={18}
            className={cn(
              variant === "healing"
                ? "text-sky-400"
                : "text-zinc-500"
            )}
          />
        )}
      </div>

      <div className="flex items-end gap-2">
        <span className="text-3xl font-semibold tracking-tight">
          {prefix}
          {displayValue}
          {suffix}
        </span>
        {typeof change === "number" && (
          <span
            className={cn(
              "text-sm font-medium mb-1",
              change >= 0 ? "text-emerald-400" : "text-red-400"
            )}
          >
            {change >= 0 ? "+" : ""}
            {change.toFixed(1)}%
          </span>
        )}
      </div>

      {sparklineData && sparklineData.length > 1 && (
        <div className="mt-3 h-8">
          <Sparkline data={sparklineData} variant={variant} />
        </div>
      )}
    </motion.div>
  );
}

function Sparkline({
  data,
  variant,
}: {
  data: number[];
  variant: "default" | "healing";
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 32;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  const color =
    variant === "healing"
      ? "var(--healing-primary)"
      : "var(--accent-primary)";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

### 4.7 Sidebar Component — `web/components/layout/sidebar.tsx`

Create this file. This replaces the existing sidebar/navigation:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Activity,
  Shield,
  BarChart3,
  Fingerprint,
  Bot,
  Bell,
  Key,
  Users,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "PROTECT",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { label: "Sessions", href: "/dashboard/sessions", icon: Activity },
      { label: "Healing", href: "/dashboard/healing", icon: Shield, badge: "NEW" },
    ],
  },
  {
    label: "ANALYZE",
    items: [
      { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
      { label: "Patterns", href: "/dashboard/patterns", icon: Fingerprint },
      { label: "Agents", href: "/dashboard/agents", icon: Bot },
    ],
  },
  {
    label: "CONFIGURE",
    items: [
      { label: "Alerts", href: "/dashboard/alerts", icon: Bell },
      { label: "API Keys", href: "/dashboard/api-keys", icon: Key },
      { label: "Team", href: "/dashboard/team", icon: Users },
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
    ],
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 56 : 220 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="fixed left-0 top-0 h-screen flex flex-col border-r z-40"
      style={{
        backgroundColor: "var(--sidebar-bg)",
        borderColor: "var(--border-default)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-3 border-b" style={{ borderColor: "var(--border-default)" }}>
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-white" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="text-sm font-semibold whitespace-nowrap overflow-hidden"
              >
                AgentStack
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] font-semibold tracking-wider px-2 mb-1 block"
                  style={{ color: "var(--text-muted)" }}
                >
                  {group.label}
                </motion.span>
              )}
            </AnimatePresence>

            {group.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors relative group mb-0.5",
                    isActive
                      ? "text-white"
                      : "hover:bg-[var(--bg-hover)]"
                  )}
                  style={{
                    color: isActive
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                    backgroundColor: isActive
                      ? "var(--bg-elevated)"
                      : undefined,
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-md"
                      style={{ backgroundColor: "var(--bg-elevated)" }}
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <item.icon size={18} className="relative z-10 flex-shrink-0" />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="relative z-10 whitespace-nowrap overflow-hidden"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {item.badge && !collapsed && (
                    <span className="relative z-10 ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t transition-colors hover:bg-[var(--bg-hover)]"
        style={{ borderColor: "var(--border-default)" }}
      >
        {collapsed ? (
          <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
        ) : (
          <ChevronLeft size={16} style={{ color: "var(--text-tertiary)" }} />
        )}
      </button>
    </motion.aside>
  );
}
```

### 4.8 Healing Dashboard Page — `web/app/dashboard/healing/page.tsx`

Create this file:

```tsx
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  DollarSign,
  TrendingDown,
  Activity,
  Repeat,
  Brain,
  Wallet,
  Clock,
  FileText,
} from "lucide-react";
import { staggerContainer, staggerItem, fadeIn } from "@/lib/animations";
import { MetricCard } from "@/components/ui/metric-card";
import { MetricCardSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";

interface HealingAnalytics {
  totals: {
    total_interventions: number;
    loop_breaks: number;
    hallucination_catches: number;
    cost_breakers: number;
    context_overflows: number;
    timeout_recoveries: number;
    total_savings_cents: number;
  };
  timeseries: Array<{
    period: string;
    total_interventions: number;
    loop_breaks: number;
    hallucination_catches: number;
    cost_breakers: number;
    context_overflows: number;
    timeout_recoveries: number;
    total_savings_cents: number;
  }>;
}

interface HealingEvent {
  id: string;
  session_id: string;
  healing_type: string;
  description: string;
  action_taken: string;
  result: string;
  saved_cost_estimate_cents: number;
  timestamp: string;
}

const HEALING_TYPE_COLORS: Record<string, string> = {
  loop_break: "#f59e0b",
  hallucination_catch: "#ef4444",
  cost_breaker: "#8b5cf6",
  context_overflow: "#3b82f6",
  timeout_recovery: "#6366f1",
};

const HEALING_TYPE_ICONS: Record<string, React.ElementType> = {
  loop_break: Repeat,
  hallucination_catch: Brain,
  cost_breaker: Wallet,
  context_overflow: FileText,
  timeout_recovery: Clock,
};

const HEALING_TYPE_LABELS: Record<string, string> = {
  loop_break: "Loop Break",
  hallucination_catch: "Hallucination Catch",
  cost_breaker: "Cost Breaker",
  context_overflow: "Context Overflow",
  timeout_recovery: "Timeout Recovery",
};

export default function HealingPage() {
  const [analytics, setAnalytics] = useState<HealingAnalytics | null>(null);
  const [recentEvents, setRecentEvents] = useState<HealingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState("day");

  useEffect(() => {
    fetchData();
  }, [granularity]);

  async function fetchData() {
    setLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [analyticsRes] = await Promise.all([
        fetch(
          `/api/v1/analytics/healing?from=${from.toISOString()}&to=${now.toISOString()}&granularity=${granularity}`
        ),
      ]);

      if (analyticsRes.ok) {
        setAnalytics(await analyticsRes.json());
      }
    } catch (err) {
      console.error("Failed to fetch healing data:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Shield — Self-Healing</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
        <div className="card">
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRowSkeleton key={i} columns={6} />
          ))}
        </div>
      </div>
    );
  }

  const totals = analytics?.totals;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div variants={fadeIn} initial="hidden" animate="visible">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield size={24} className="text-sky-400" />
          Shield — Self-Healing
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Automatic interventions that protect your AI agents from failure loops,
          hallucinations, and runaway costs.
        </p>
      </motion.div>

      {/* Metric Cards */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <motion.div variants={staggerItem}>
          <MetricCard
            title="Total Interventions"
            value={totals?.total_interventions ?? 0}
            icon={Activity}
            variant="healing"
            sparklineData={analytics?.timeseries?.map((t) => t.total_interventions)}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <MetricCard
            title="Money Saved"
            value={(totals?.total_savings_cents ?? 0) / 100}
            prefix="$"
            decimals={2}
            icon={DollarSign}
            variant="healing"
            sparklineData={analytics?.timeseries?.map(
              (t) => t.total_savings_cents / 100
            )}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <MetricCard
            title="Loops Broken"
            value={totals?.loop_breaks ?? 0}
            icon={Repeat}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <MetricCard
            title="Hallucinations Caught"
            value={totals?.hallucination_catches ?? 0}
            icon={Brain}
          />
        </motion.div>
      </motion.div>

      {/* Granularity selector */}
      <div className="flex gap-1">
        {["hour", "day", "week", "month"].map((g) => (
          <button
            key={g}
            onClick={() => setGranularity(g)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors btn-press",
              g === granularity
                ? "bg-[var(--bg-elevated)] text-white"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            )}
          >
            {g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      {/* Stacked Bar Chart — Healing Over Time */}
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="card"
      >
        <h2
          className="text-sm font-medium mb-4"
          style={{ color: "var(--text-secondary)" }}
        >
          Healing Interventions Over Time
        </h2>
        <div className="h-64">
          <HealingStackedBar data={analytics?.timeseries ?? []} />
        </div>
      </motion.div>

      {/* Recent Events Table */}
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="card"
      >
        <h2
          className="text-sm font-medium mb-4"
          style={{ color: "var(--text-secondary)" }}
        >
          Recent Healing Events
        </h2>
        {analytics?.timeseries && analytics.timeseries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr
                  className="text-left text-xs font-medium border-b"
                  style={{
                    color: "var(--text-tertiary)",
                    borderColor: "var(--border-default)",
                  }}
                >
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Description</th>
                  <th className="pb-3 pr-4">Action</th>
                  <th className="pb-3 pr-4">Saved</th>
                  <th className="pb-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((event) => {
                  const Icon =
                    HEALING_TYPE_ICONS[event.healing_type] || Activity;
                  return (
                    <tr key={event.id} className="table-row">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Icon
                            size={14}
                            style={{
                              color:
                                HEALING_TYPE_COLORS[event.healing_type] ||
                                "var(--text-secondary)",
                            }}
                          />
                          <span className="text-sm">
                            {HEALING_TYPE_LABELS[event.healing_type] ||
                              event.healing_type}
                          </span>
                        </div>
                      </td>
                      <td
                        className="py-3 pr-4 text-sm max-w-xs truncate"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {event.description}
                      </td>
                      <td
                        className="py-3 pr-4 text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {event.action_taken}
                      </td>
                      <td className="py-3 pr-4 text-sm text-sky-400">
                        {event.saved_cost_estimate_cents > 0
                          ? `$${(event.saved_cost_estimate_cents / 100).toFixed(2)}`
                          : "-"}
                      </td>
                      <td
                        className="py-3 text-sm font-mono"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )}
      </motion.div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Shield
        size={48}
        className="mb-4"
        style={{ color: "var(--text-muted)" }}
      />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        No healing events yet
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
        Enable Shield in your SDK to start seeing self-healing interventions.
      </p>
    </div>
  );
}

function HealingStackedBar({
  data,
}: {
  data: Array<{
    period: string;
    loop_breaks: number;
    hallucination_catches: number;
    cost_breakers: number;
    context_overflows: number;
    timeout_recoveries: number;
  }>;
}) {
  if (!data.length) return <EmptyState />;

  const types = [
    { key: "loop_breaks" as const, color: HEALING_TYPE_COLORS.loop_break, label: "Loops" },
    { key: "hallucination_catches" as const, color: HEALING_TYPE_COLORS.hallucination_catch, label: "Hallucinations" },
    { key: "cost_breakers" as const, color: HEALING_TYPE_COLORS.cost_breaker, label: "Cost" },
    { key: "context_overflows" as const, color: HEALING_TYPE_COLORS.context_overflow, label: "Context" },
    { key: "timeout_recoveries" as const, color: HEALING_TYPE_COLORS.timeout_recovery, label: "Timeout" },
  ];

  const maxTotal = Math.max(
    ...data.map((d) =>
      types.reduce((sum, t) => sum + (d[t.key] || 0), 0)
    ),
    1
  );

  const barWidth = Math.max(100 / data.length - 1, 4);

  return (
    <div className="h-full flex flex-col">
      {/* Legend */}
      <div className="flex gap-4 mb-4">
        {types.map((t) => (
          <div key={t.key} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.color }} />
            {t.label}
          </div>
        ))}
      </div>
      {/* Bars */}
      <div className="flex-1 flex items-end gap-1">
        {data.map((d, i) => {
          const total = types.reduce((sum, t) => sum + (d[t.key] || 0), 0);
          return (
            <div
              key={i}
              className="flex flex-col-reverse"
              style={{
                width: `${barWidth}%`,
                height: `${(total / maxTotal) * 100}%`,
                minHeight: total > 0 ? 4 : 0,
              }}
            >
              {types.map((t) => {
                const value = d[t.key] || 0;
                if (value === 0) return null;
                return (
                  <div
                    key={t.key}
                    className="rounded-sm transition-all duration-300"
                    style={{
                      backgroundColor: t.color,
                      height: `${(value / total) * 100}%`,
                      minHeight: 2,
                    }}
                    title={`${t.label}: ${value}`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex gap-1 mt-2">
        {data.map((d, i) => (
          <div
            key={i}
            className="text-[10px] text-center truncate"
            style={{ width: `${barWidth}%`, color: "var(--text-muted)" }}
          >
            {formatPeriod(d.period)}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatPeriod(period: string): string {
  try {
    const d = new Date(period);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return period;
  }
}
```

### 4.9 Update Overview Page

Find the existing overview/dashboard page (likely `web/app/dashboard/page.tsx` or `web/app/dashboard/overview/page.tsx`). Add two new metric cards:

1. **"Healings This Period"** — Shows total healing interventions count with the Shield icon and `variant="healing"`
2. **"Money Saved"** — Shows total savings in dollars with DollarSign icon and `variant="healing"`

Add these cards to the existing metric cards grid. The data should come from the `/api/v1/analytics/healing` endpoint totals.

Also add a second chart section showing "Healing Breakdown" as a bar chart using the same `HealingStackedBar` component.

### 4.10 Update Session Detail Page — Healing Markers

Find the existing session detail page (shows the Gantt-chart timeline of spans). Add healing intervention markers:

For each healing event in the session, render a diamond marker on the timeline:

```tsx
{/* Healing intervention marker */}
{healingEvents.map((event) => (
  <div
    key={event.id}
    className="healing-marker"
    style={{
      left: `${calculateTimelinePosition(event.timestamp)}%`,
      top: "50%",
      transform: "translate(-50%, -50%) rotate(45deg)",
    }}
    title={`${HEALING_TYPE_LABELS[event.healing_type]}: ${event.description}`}
  />
))}
```

Below the timeline, add a "Healing Interventions" section that shows cards for each intervention:

```tsx
{healingEvents.length > 0 && (
  <div className="mt-6">
    <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
      <Shield size={14} className="text-sky-400" />
      Healing Interventions ({healingEvents.length})
    </h3>
    <div className="space-y-2">
      {healingEvents.map((event) => {
        const Icon = HEALING_TYPE_ICONS[event.healing_type] || Activity;
        return (
          <div key={event.id} className="card healing-glow p-3 flex items-start gap-3">
            <Icon size={16} className="text-sky-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{HEALING_TYPE_LABELS[event.healing_type]}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{event.description}</div>
              <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                Action: {event.action_taken}
              </div>
            </div>
            {event.saved_cost_estimate_cents > 0 && (
              <span className="text-xs font-mono text-sky-400">
                saved ${(event.saved_cost_estimate_cents / 100).toFixed(2)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  </div>
)}
```

### 4.11 Update Sessions List Page

Find the sessions list/table page. Add a "Healings" column:

```tsx
{/* In the table header */}
<th className="pb-3 pr-4">Healings</th>

{/* In each row */}
<td className="py-3 pr-4">
  {session.healing_interventions > 0 ? (
    <div className="flex items-center gap-1.5">
      <Shield size={12} className="text-sky-400" />
      <span className="text-sm">{session.healing_interventions}</span>
    </div>
  ) : (
    <span className="text-sm" style={{ color: "var(--text-muted)" }}>-</span>
  )}
</td>
```

### 4.12 Update Layout

Update the dashboard layout (`web/app/dashboard/layout.tsx`) to use the new Sidebar component:

```tsx
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      <Sidebar />
      <main
        className="transition-all duration-200"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        {children}
      </main>
    </div>
  );
}
```

### 4.13 Toast Notification Component — `web/components/ui/toast.tsx`

Create this file:

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

let toastId = 0;
const listeners: Set<(toast: Toast) => void> = new Set();

export function showToast(type: ToastType, message: string) {
  const toast: Toast = { id: String(++toastId), type, message };
  listeners.forEach((fn) => fn(toast));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4000);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const icons = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
  };
  const colors = {
    success: "var(--status-success)",
    error: "var(--status-error)",
    info: "var(--status-info)",
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[300px]"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-default)",
              }}
            >
              <Icon size={16} style={{ color: colors[toast.type] }} />
              <span className="text-sm flex-1">{toast.message}</span>
              <button
                onClick={() =>
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id))
                }
                className="p-0.5 rounded hover:bg-[var(--bg-hover)]"
              >
                <X size={14} style={{ color: "var(--text-tertiary)" }} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
```

Add `<ToastContainer />` to the root layout (`web/app/layout.tsx`) inside the `<body>` tag.

### 4.14 Phase 4 Verification

```bash
cd web
npm run build
npm run lint
```

Both must pass. Visually verify:
- Dark theme applied everywhere
- Sidebar collapses/expands smoothly
- Metric cards animate count-up on load
- Skeleton loading shows shimmer
- Healing page loads (even if empty)
- Session detail shows healing markers (when present)

---

## PHASE 5: LANDING PAGE

### 5.1 Create Landing Page — `web/app/page.tsx`

Create or replace this file:

```tsx
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Shield,
  Activity,
  TestTube2,
  Lock,
  GitBranch,
  DollarSign,
  Check,
  ArrowRight,
  Terminal,
  Zap,
  ExternalLink,
} from "lucide-react";
import { staggerContainer, staggerItem, fadeIn } from "@/lib/animations";

const MODULES = [
  {
    name: "Shield",
    icon: Shield,
    description: "Self-healing SDK that catches loops, hallucinations, and cost overruns in real-time.",
    color: "#38bdf8",
    available: true,
  },
  {
    name: "Trace",
    icon: Activity,
    description: "Full session tracing with spans, events, and failure pattern matching.",
    color: "#6366f1",
    available: true,
  },
  {
    name: "Test",
    icon: TestTube2,
    description: "Automated regression testing for agent workflows and tool chains.",
    color: "#22c55e",
    available: false,
  },
  {
    name: "Guard",
    icon: Lock,
    description: "Input/output guardrails with PII detection and content filtering.",
    color: "#f59e0b",
    available: false,
  },
  {
    name: "Route",
    icon: GitBranch,
    description: "Intelligent model routing with automatic fallback and A/B testing.",
    color: "#8b5cf6",
    available: false,
  },
  {
    name: "Cost",
    icon: DollarSign,
    description: "Real-time cost tracking, budgeting, and optimization across providers.",
    color: "#ec4899",
    available: false,
  },
];

const COMPARISON = [
  {
    feature: "Self-Healing SDK",
    agentstack: true,
    langfuse: false,
    maxim: false,
    braintrust: false,
    portkey: false,
  },
  {
    feature: "Loop Detection",
    agentstack: true,
    langfuse: false,
    maxim: false,
    braintrust: false,
    portkey: false,
  },
  {
    feature: "Hallucination Catching",
    agentstack: true,
    langfuse: false,
    maxim: false,
    braintrust: false,
    portkey: false,
  },
  {
    feature: "Cost Breaker",
    agentstack: true,
    langfuse: false,
    maxim: false,
    braintrust: false,
    portkey: true,
  },
  {
    feature: "Context Overflow Prevention",
    agentstack: true,
    langfuse: false,
    maxim: false,
    braintrust: false,
    portkey: false,
  },
  {
    feature: "Session Tracing",
    agentstack: true,
    langfuse: true,
    maxim: true,
    braintrust: true,
    portkey: true,
  },
  {
    feature: "Failure Patterns",
    agentstack: true,
    langfuse: false,
    maxim: true,
    braintrust: false,
    portkey: false,
  },
  {
    feature: "Self-Hosted Option",
    agentstack: true,
    langfuse: true,
    maxim: false,
    braintrust: false,
    portkey: false,
  },
  {
    feature: "Open Source",
    agentstack: true,
    langfuse: true,
    maxim: false,
    braintrust: false,
    portkey: false,
  },
];

const PRICING = [
  {
    name: "Self-Hosted",
    price: "Free",
    period: "forever",
    description: "Run on your own infrastructure",
    features: [
      "Unlimited sessions",
      "Shield self-healing",
      "Full tracing",
      "Community support",
      "Docker Compose setup",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Cloud",
    price: "$49",
    period: "/mo",
    description: "Managed hosting, zero ops",
    features: [
      "50,000 sessions/mo",
      "Shield self-healing",
      "Full tracing",
      "7-day retention",
      "Email support",
      "Slack alerts",
    ],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Team",
    price: "$199",
    period: "/mo",
    description: "For growing teams",
    features: [
      "500,000 sessions/mo",
      "Shield self-healing",
      "Full tracing",
      "30-day retention",
      "Priority support",
      "SSO / SAML",
      "Team management",
      "Custom alerts",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Dedicated infrastructure",
    features: [
      "Unlimited sessions",
      "Shield self-healing",
      "Full tracing",
      "Custom retention",
      "Dedicated support",
      "SSO / SAML",
      "SLA guarantee",
      "On-premise option",
      "Custom integrations",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* ─── NAV ─── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{
          backgroundColor: "rgba(10, 10, 11, 0.8)",
          backdropFilter: "blur(12px)",
          borderColor: "var(--border-default)",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="text-sm font-semibold">AgentStack</span>
          </Link>
          <div className="flex items-center gap-6">
            <a href="#modules" className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Modules
            </a>
            <a href="#pricing" className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Pricing
            </a>
            <a
              href="https://github.com/agentstack"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              GitHub
            </a>
            <Link
              href="/dashboard"
              className="text-sm px-3 py-1.5 rounded-md btn-press"
              style={{
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-primary)",
              }}
            >
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
            style={{ background: "radial-gradient(circle, #6366f1, transparent 70%)", top: "-200px", right: "-100px" }}
            animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute w-[500px] h-[500px] rounded-full opacity-15 blur-3xl"
            style={{ background: "radial-gradient(circle, #38bdf8, transparent 70%)", bottom: "-150px", left: "-100px" }}
            animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6 border"
              style={{
                backgroundColor: "var(--healing-glow)",
                borderColor: "var(--healing-border)",
                color: "var(--healing-text)",
              }}
            >
              <Shield size={12} />
              Now with Self-Healing SDK
            </div>

            <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-[1.1]">
              Your AI Agents Are Failing.
              <br />
              <span className="bg-gradient-to-r from-indigo-400 via-sky-400 to-violet-400 bg-clip-text text-transparent">
                We Fix Them.
              </span>
            </h1>

            <p
              className="text-lg max-w-2xl mx-auto mb-8"
              style={{ color: "var(--text-secondary)" }}
            >
              AgentStack is the observability and self-healing platform for AI agents.
              Trace every session, catch failures before users do, and let Shield
              automatically recover from loops, hallucinations, and runaway costs.
            </p>

            <div className="flex items-center justify-center gap-4 mb-12">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium btn-press text-white"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                Start Free
                <ArrowRight size={16} />
              </Link>
              <a
                href="https://github.com/agentstack"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium btn-press border"
                style={{
                  borderColor: "var(--border-default)",
                  color: "var(--text-secondary)",
                }}
              >
                View on GitHub
                <ExternalLink size={14} />
              </a>
            </div>
          </motion.div>

          {/* Animated terminal */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="max-w-lg mx-auto rounded-xl border overflow-hidden shadow-2xl"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-default)",
            }}
          >
            <div
              className="flex items-center gap-1.5 px-4 py-3 border-b"
              style={{ borderColor: "var(--border-default)" }}
            >
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <span
                className="ml-2 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                terminal
              </span>
            </div>
            <div className="p-4 font-mono text-sm space-y-2">
              <div className="flex items-center gap-2">
                <span style={{ color: "var(--status-success)" }}>$</span>
                <TypingAnimation text="pip install agentstack" delay={0.5} />
              </div>
              <div className="mt-3 space-y-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2.5 }}
                >
                  Installing agentstack...
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 3.0 }}
                  style={{ color: "var(--status-success)" }}
                >
                  Successfully installed agentstack-1.0.0
                </motion.div>
              </div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3.5 }}
                className="mt-3 flex items-center gap-2"
              >
                <span style={{ color: "var(--status-success)" }}>$</span>
                <TypingAnimation text='python -c "import agentstack; print(agentstack.__version__)"' delay={4} speed={30} />
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 6.5 }}
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                1.0.0
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── MODULES ─── */}
      <section id="modules" className="py-24 border-t" style={{ borderColor: "var(--border-default)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold mb-3">6 Modules. One Platform.</h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Everything you need to build reliable AI agents.
            </p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {MODULES.map((mod) => (
              <motion.div
                key={mod.name}
                variants={staggerItem}
                className="card group relative overflow-hidden"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${mod.color}15` }}
                  >
                    <mod.icon size={18} style={{ color: mod.color }} />
                  </div>
                  <div>
                    <span className="font-medium">{mod.name}</span>
                    {!mod.available && (
                      <span
                        className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {mod.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── COMPARISON ─── */}
      <section className="py-24 border-t" style={{ borderColor: "var(--border-default)" }}>
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold mb-3">Why AgentStack?</h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              The only platform with built-in self-healing for AI agents.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="overflow-x-auto"
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <th className="text-left py-3 pr-4 font-medium" style={{ color: "var(--text-secondary)" }}>
                    Feature
                  </th>
                  <th className="py-3 px-4 font-semibold text-sky-400">AgentStack</th>
                  <th className="py-3 px-4 font-medium" style={{ color: "var(--text-tertiary)" }}>Langfuse</th>
                  <th className="py-3 px-4 font-medium" style={{ color: "var(--text-tertiary)" }}>Maxim</th>
                  <th className="py-3 px-4 font-medium" style={{ color: "var(--text-tertiary)" }}>Braintrust</th>
                  <th className="py-3 px-4 font-medium" style={{ color: "var(--text-tertiary)" }}>Portkey</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-b"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    <td className="py-3 pr-4" style={{ color: "var(--text-secondary)" }}>
                      {row.feature}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {row.agentstack ? (
                        <Check size={16} className="inline text-sky-400" />
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {row.langfuse ? (
                        <Check size={16} className="inline" style={{ color: "var(--text-tertiary)" }} />
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {row.maxim ? (
                        <Check size={16} className="inline" style={{ color: "var(--text-tertiary)" }} />
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {row.braintrust ? (
                        <Check size={16} className="inline" style={{ color: "var(--text-tertiary)" }} />
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {row.portkey ? (
                        <Check size={16} className="inline" style={{ color: "var(--text-tertiary)" }} />
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-24 border-t" style={{ borderColor: "var(--border-default)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold mb-3">Simple, Transparent Pricing</h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Start free, scale as you grow. No surprises.
            </p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {PRICING.map((plan) => (
              <motion.div
                key={plan.name}
                variants={staggerItem}
                className={`card flex flex-col ${
                  plan.highlighted
                    ? "border-indigo-500/50 shadow-lg shadow-indigo-500/10"
                    : ""
                }`}
              >
                {plan.highlighted && (
                  <div className="text-[10px] font-semibold text-indigo-400 mb-2 uppercase tracking-wider">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-2 mb-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <p
                  className="text-xs mb-4"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {plan.description}
                </p>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check
                        size={14}
                        className="mt-0.5 flex-shrink-0"
                        style={{ color: "var(--status-success)" }}
                      />
                      <span style={{ color: "var(--text-secondary)" }}>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={`w-full py-2 rounded-md text-sm font-medium btn-press ${
                    plan.highlighted
                      ? "text-white"
                      : "border"
                  }`}
                  style={
                    plan.highlighted
                      ? { background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }
                      : {
                          borderColor: "var(--border-default)",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="py-24 border-t" style={{ borderColor: "var(--border-default)" }}>
        <div className="max-w-2xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold mb-4">
              Start protecting your agents
              <br />
              in 60 seconds.
            </h2>
            <p
              className="text-sm mb-8"
              style={{ color: "var(--text-secondary)" }}
            >
              Install the SDK, add two lines of code, and Shield starts healing
              your agents automatically.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium btn-press text-white"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                Get Started Free
                <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer
        className="border-t py-8"
        style={{ borderColor: "var(--border-default)" }}
      >
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Zap size={12} className="text-white" />
            </div>
            <span className="text-sm font-medium">AgentStack</span>
          </div>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Built for developers who ship AI agents.
          </span>
        </div>
      </footer>
    </div>
  );
}

// ── Typing animation component ──

function TypingAnimation({
  text,
  delay = 0,
  speed = 50,
}: {
  text: string;
  delay?: number;
  speed?: number;
}) {
  return (
    <span className="inline-flex">
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + i * (speed / 1000) }}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{
          delay: delay + text.length * (speed / 1000),
          duration: 1,
          repeat: Infinity,
        }}
        className="ml-0.5"
        style={{ color: "var(--status-success)" }}
      >
        |
      </motion.span>
    </span>
  );
}
```

### 5.2 Phase 5 Verification

```bash
cd web
npm run build
```

Verify visually:
- Landing page loads at `/`
- Gradient orbs animate smoothly
- Terminal typing animation plays
- 6 module cards display
- Comparison table renders
- Pricing cards display
- All links work

---

## TESTING & VALIDATION

### Final Checklist

Run these commands and verify all pass:

```bash
# 1. No remaining "agentlens" references
grep -ri "agentlens" --include="*.go" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.yaml" --include="*.yml" --include="*.toml" --include="*.cfg" --include="*.css" --include="*.html" .
# Should return ZERO results (except this spec file if present)

# 2. No remaining "al_sk_" references
grep -r "al_sk_" --include="*.go" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" .
# Should return ZERO results

# 3. Go builds cleanly
go build ./...
go vet ./...

# 4. Python SDK imports
cd sdk/python
python -c "
from agentstack import HealingConfig, HealingEngine, CostLimitExceeded, tool
print('All imports OK')
"

# 5. TypeScript SDK builds
cd sdk/typescript
npx tsc --noEmit

# 6. Next.js builds
cd web
npm run build

# 7. Docker services start
docker compose up -d
# Wait 30 seconds, then:
curl http://localhost:8081/health
curl http://localhost:3001
```

### Smoke Test — Shield End-to-End

Create a test script `test_shield.py`:

```python
"""Quick smoke test for the Shield module."""
from agentstack import HealingConfig, HealingEngine

# Mock session
class MockSession:
    def __init__(self):
        self.events = []
    def add_event(self, category, action, data):
        self.events.append({"category": category, "action": action, "data": data})

session = MockSession()
config = HealingConfig(loop_threshold=2, cost_limit_cents=100)
engine = HealingEngine(config, session)

# Test loop detection
result1 = engine.before_tool_call("search", {"query": "test"})
assert result1 is None, "First call should pass"

result2 = engine.before_tool_call("search", {"query": "test"})
assert result2 is None, "Second call should pass"

result3 = engine.before_tool_call("search", {"query": "test"})
assert result3 is not None, "Third call should trigger loop detection"
assert "3 times" in result3

# Test hallucination catch
recovery = engine.on_tool_error("fake_tool", Exception("Tool not found: fake_tool"))
assert recovery is not None, "Should catch hallucination"
assert "does not exist" in recovery

# Test cost breaker
engine.update_cost(101, 5000)  # Over the 100 cent limit
try:
    engine.before_tool_call("any_tool", {})
    assert False, "Should have raised CostLimitExceeded"
except Exception as e:
    assert "CostLimitExceeded" in type(e).__name__

# Test context overflow
engine2 = HealingEngine(HealingConfig(context_summarize_at=0.8), MockSession())
result = engine2.check_context(85000, 100000)
assert result is not None, "Should trigger context overflow"
assert "summarize" in result.lower()

# Summary
summary = engine.get_summary()
assert summary["total_interventions"] >= 2
print(f"Shield smoke test PASSED - {summary['total_interventions']} interventions recorded")
```

Run it:
```bash
cd sdk/python
python ../../test_shield.py
```

---

## PROJECT STRUCTURE (after all phases)

```
agentstack/
├── cmd/
│   └── api/
│       └── main.go
├── internal/
│   ├── auth/
│   ├── database/
│   ├── healing/               ← NEW
│   │   ├── handler.go
│   │   └── repository.go
│   ├── ingest/
│   ├── models/
│   ├── patterns/
│   ├── server/
│   └── ...
├── migrations/
│   └── clickhouse/
│       ├── ...existing...
│       ├── NNNN_healing_events.up.sql    ← NEW
│       └── NNNN_healing_events.down.sql  ← NEW
├── sdk/
│   ├── python/
│   │   └── agentstack/       ← RENAMED from agentlens
│   │       ├── __init__.py   ← UPDATED
│   │       ├── healing.py    ← NEW
│   │       ├── tools.py      ← NEW
│   │       ├── tracing.py    ← UPDATED (healing integration)
│   │       └── ...
│   └── typescript/
│       └── src/
│           ├── index.ts      ← UPDATED
│           ├── healing.ts    ← NEW
│           ├── tracing.ts    ← UPDATED (healing integration)
│           └── ...
├── web/
│   ├── app/
│   │   ├── page.tsx          ← NEW (landing page)
│   │   ├── layout.tsx        ← UPDATED (toast container)
│   │   ├── globals.css       ← UPDATED (design system)
│   │   └── dashboard/
│   │       ├── layout.tsx    ← UPDATED (sidebar)
│   │       ├── page.tsx      ← UPDATED (healing cards)
│   │       ├── healing/
│   │       │   └── page.tsx  ← NEW
│   │       ├── sessions/
│   │       │   └── ...       ← UPDATED (healing column, markers)
│   │       └── ...
│   ├── components/
│   │   ├── layout/
│   │   │   └── sidebar.tsx   ← NEW
│   │   └── ui/
│   │       ├── metric-card.tsx ← NEW
│   │       ├── skeleton.tsx    ← NEW
│   │       └── toast.tsx       ← NEW
│   ├── hooks/
│   │   └── useCountUp.ts    ← NEW
│   ├── lib/
│   │   └── animations.ts    ← NEW
│   └── package.json          ← UPDATED (framer-motion, lucide-react)
├── docker-compose.yml        ← UPDATED (renamed services)
├── go.mod                    ← UPDATED (module path)
└── go.sum
```

---

## NOTES FOR THE IMPLEMENTING AGENT

1. **Do each phase sequentially.** Do not skip ahead. Verify each phase builds before starting the next.

2. **The rename phase is the most dangerous.** Be thorough. Use `grep -ri` to verify no references remain. Watch for:
   - String literals in Go (error messages, log lines)
   - API key validation patterns
   - Environment variable names
   - Docker labels and service names
   - Package metadata (setup.py, package.json)

3. **Adapt to existing patterns.** The code above provides the logic, but you must integrate it with existing code:
   - Match the existing error handling patterns
   - Use the same database connection patterns
   - Follow the existing route registration style
   - Use the same auth middleware

4. **For the UI overhaul**, do not delete existing pages. Modify them in-place. The design system CSS variables should be additive, not destructive.

5. **The healing handler's `getOrgIDFromContext`** function is a placeholder. You MUST look at how existing handlers extract the org ID from the request context and match that pattern exactly.

6. **Import paths may vary.** The `@/lib/utils` and `@/components/ui/` paths assume Next.js path aliases are configured. Verify these exist; if not, use relative imports.

7. **If `cn` utility doesn't exist**, install `clsx` and `tailwind-merge`:
   ```bash
   cd web && npm install clsx tailwind-merge
   ```
   Then create `web/lib/utils.ts`:
   ```typescript
   import { clsx, type ClassValue } from "clsx";
   import { twMerge } from "tailwind-merge";
   export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
   ```

8. **Test continuously.** After every significant change, run the relevant build command to ensure nothing is broken.
