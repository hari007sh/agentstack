# AgentStack — Master Build Document

This is the MASTER document. Read this FIRST before writing any code.

## 1. What is AgentStack

AgentStack is an open-source AI agent production platform. It replaces 5-6 separate tools (Langfuse, DeepEval, Portkey, Guardrails AI, custom code) with one unified platform. Tagline: "The open-source platform for AI agents in production." It consists of six modules: **Shield** (self-healing SDK that auto-fixes loops, hallucinations, cost overruns, and timeouts — the unique differentiator nobody else offers), **Trace** (observability with session replay, tracing, failure patterns, and alerts), **Test** (evaluation with 15+ evaluators, CI/CD quality gates, regression tests, and CLI), **Guard** (guardrails for PII detection, toxicity filtering, prompt injection, and hallucination detection), **Route** (gateway with model routing, provider failover, semantic caching, and load balancing), and **Cost** (cost intelligence with per-outcome cost tracking, budget enforcement, and model comparison).

---

## 2. Architecture Overview

Six modules connected through a unified API server, gateway proxy, and shared infrastructure.

```
┌────────────────────────────────────────────────────────┐
│                    AgentStack SDK                       │
│          (Python + TypeScript — pip/npm install)        │
│                                                        │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│   │  Shield   │  │  Trace   │  │  Guard   │            │
│   │(healing)  │  │(spans)   │  │(checks)  │            │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘            │
└────────┼──────────────┼──────────────┼─────────────────┘
         │              │              │
         ▼              ▼              ▼
┌────────────────────────────────────────────────────────┐
│              AgentStack API Server (Go)                 │
│                   Port 8080                             │
│                                                        │
│   /v1/ingest/*     → Trace module (sessions, spans)    │
│   /v1/ingest/healing → Shield module (healing events)  │
│   /v1/sessions/*   → Trace module (query)              │
│   /v1/analytics/*  → Trace + Cost analytics            │
│   /v1/test/*       → Test module (suites, runs, evals) │
│   /v1/guard/*      → Guard module (rules, checks)      │
│   /v1/cost/*       → Cost module (events, budgets)     │
│   /v1/gateway/*    → Route module (management)         │
│   /v1/patterns/*   → Trace module (failure patterns)   │
│   /v1/alerts/*     → Trace module (alert rules)        │
└───────────┬───────────────────────────────┬────────────┘
            │                               │
    ┌───────▼───────┐              ┌────────▼────────┐
    │  PostgreSQL    │              │   ClickHouse    │
    │  Port 5432     │              │   Port 9000     │
    │                │              │                 │
    │ - users        │              │ - sessions      │
    │ - orgs         │              │ - spans         │
    │ - api_keys     │              │ - events        │
    │ - agents       │              │ - healing_events│
    │ - alert_rules  │              │ - gateway_reqs  │
    │ - patterns     │              │                 │
    │ - test_suites  │              └─────────────────┘
    │ - test_cases   │
    │ - test_runs    │        ┌─────────────────┐
    │ - evaluators   │        │     Redis        │
    │ - cost_events  │        │   Port 6379      │
    │ - budgets      │        │                  │
    │ - model_pricing│        │ - rate limiting   │
    │ - guardrails   │        │ - cache           │
    │ - guard_events │        │ - session store   │
    │ - providers    │        │ - semantic cache   │
    │ - routes       │        └─────────────────┘
    │ - fallbacks    │
    │ - cache_entries│        ┌─────────────────┐
    └───────────────┘        │      NATS        │
                              │   Port 4222      │
┌─────────────────────┐      │                  │
│  Gateway Proxy (Go)  │      │ - event pipeline │
│    Port 8090         │      │ - async ingest   │
│                      │      └─────────────────┘
│  OpenAI-compatible   │
│  /v1/chat/completions│      ┌─────────────────┐
│  /v1/embeddings      │      │   Next.js        │
│                      │      │   Port 3000      │
│  Applies: Route +    │      │                  │
│  Guard + Cache       │      │  Unified         │
└──────────────────────┘      │  Dashboard       │
                              └─────────────────┘
```

### Data Flow

1. **SDK → API Server:** SDKs send trace spans, healing events, guard checks, and cost events to the API server on port 8080.
2. **API Server → NATS:** High-volume ingestion (spans, events) is published to NATS for async processing. API responses are never blocked on ClickHouse writes.
3. **NATS → Workers → ClickHouse:** Background workers consume from NATS and batch-write to ClickHouse.
4. **API Server → PostgreSQL:** Configuration data (users, orgs, test suites, guard rules, budgets, routes) is stored in PostgreSQL.
5. **API Server → Redis:** Rate limiting, session cache, and semantic cache lookups.
6. **Gateway Proxy (port 8090):** Receives OpenAI-compatible requests, applies routing rules, guard checks, semantic caching, and provider failover, then proxies to the selected LLM provider. Logs requests asynchronously via NATS.
7. **Dashboard (port 3000):** Next.js app reads from the API server to display all six modules in a unified UI.

---

## 3. Tech Stack

| Component | Technology | Version | Why |
|-----------|-----------|---------|-----|
| Backend API | Go | 1.22+ | High performance, low latency, excellent concurrency for proxy workloads |
| Gateway Proxy | Go | 1.22+ (separate binary) | Must add <5ms overhead; Go delivers this |
| Dashboard | Next.js (App Router) | 14+ | React server components, file-based routing, great DX |
| UI Framework | Tailwind CSS + shadcn/ui | latest | Composable, themeable, production-quality components |
| Animations | Framer Motion | latest | Declarative animations, layout transitions |
| Icons | lucide-react | latest | Consistent, tree-shakeable icon set |
| Fonts | Inter (UI) + JetBrains Mono (code) | Google Fonts | Clean readability for dashboards + monospace for traces |
| Time-series DB | ClickHouse | latest | Append-only columnar storage, fast aggregations on billions of spans |
| Config/User DB | PostgreSQL | 16+ | Reliable relational storage for config, users, CRUD data |
| Cache | Redis | 7+ | Sub-millisecond rate limiting, semantic cache, session store |
| Event Streaming | NATS | latest | Lightweight, JetStream for durable async ingestion pipeline |
| SDKs | Python 3.9+ / TypeScript (Node 18+) | — | Cover the two dominant AI/ML ecosystems |
| Container | Docker + Docker Compose | — | One-command local dev environment |
| HTTP Router | go-chi/chi/v5 | latest | Lightweight, idiomatic Go, middleware-friendly |
| JWT | golang-jwt/jwt/v5 | latest | Standard JWT implementation |
| Migrations | golang-migrate/migrate/v4 | latest | SQL-file-based, up/down migrations |

---

## 4. Project Structure

```
agentstack/
├── CLAUDE.md
├── docker-compose.yml
├── docker-compose.prod.yml
├── Makefile
├── go.mod
├── go.sum
├── .env.example
├── .gitignore
│
├── cmd/
│   ├── server/main.go          # Unified API server (port 8080)
│   ├── gateway/main.go         # Route proxy server (port 8090)
│   ├── worker/main.go          # Background workers
│   ├── migrate/main.go         # Database migrations
│   └── cli/main.go             # agentstack CLI tool
│
├── internal/
│   ├── config/config.go        # Environment-based config
│   ├── server/
│   │   ├── server.go           # HTTP server setup
│   │   ├── routes.go           # ALL route registration
│   │   └── middleware/
│   │       ├── auth.go         # API key authentication
│   │       ├── ratelimit.go    # Rate limiting
│   │       └── cors.go
│   │
│   ├── trace/                  # TRACE MODULE
│   │   ├── handler/
│   │   │   ├── ingest.go       # POST /v1/ingest/*
│   │   │   ├── sessions.go     # GET /v1/sessions/*
│   │   │   ├── analytics.go    # GET /v1/analytics/*
│   │   │   ├── patterns.go     # GET /v1/patterns/*
│   │   │   ├── alerts.go       # Alert rule CRUD
│   │   │   └── agents.go       # Agent definition CRUD
│   │   ├── service/
│   │   │   ├── ingest.go
│   │   │   ├── session.go
│   │   │   ├── analytics.go
│   │   │   ├── pattern.go
│   │   │   └── alert.go
│   │   └── store/
│   │       ├── clickhouse.go
│   │       └── postgres.go
│   │
│   ├── shield/                 # SHIELD MODULE
│   │   ├── handler/
│   │   │   └── healing.go      # POST /v1/ingest/healing, GET /v1/sessions/{id}/healing, GET /v1/analytics/healing
│   │   ├── service/
│   │   │   └── healing.go
│   │   └── store/
│   │       └── clickhouse.go
│   │
│   ├── test/                   # TEST MODULE
│   │   ├── handler/
│   │   │   ├── suites.go
│   │   │   ├── cases.go
│   │   │   ├── runs.go
│   │   │   └── evaluators.go
│   │   ├── service/
│   │   │   ├── runner.go       # Test execution orchestrator
│   │   │   ├── evaluator.go    # Evaluator engine (LLM-judge + programmatic)
│   │   │   └── llm_client.go   # LLM calls for evaluators
│   │   └── store/
│   │       └── postgres.go
│   │
│   ├── guard/                  # GUARD MODULE
│   │   ├── handler/
│   │   │   ├── rules.go
│   │   │   ├── check.go        # POST /v1/guard/check
│   │   │   └── events.go
│   │   ├── service/
│   │   │   ├── engine.go       # Parallel guard execution
│   │   │   ├── pii.go          # Regex-based PII detection
│   │   │   ├── toxicity.go     # LLM-judge
│   │   │   ├── injection.go    # Pattern + LLM hybrid
│   │   │   ├── hallucination.go # LLM-judge
│   │   │   ├── topic.go        # LLM-judge
│   │   │   ├── code_exec.go    # Regex patterns
│   │   │   ├── length.go       # Programmatic
│   │   │   └── custom.go       # User-defined LLM policy
│   │   └── store/
│   │       └── postgres.go
│   │
│   ├── route/                  # ROUTE MODULE
│   │   ├── handler/
│   │   │   ├── providers.go
│   │   │   ├── routes.go
│   │   │   ├── fallbacks.go
│   │   │   ├── cache.go
│   │   │   └── analytics.go
│   │   ├── gateway/
│   │   │   ├── proxy.go        # Core proxy logic
│   │   │   ├── router.go       # Model/provider selection
│   │   │   ├── cache.go        # Semantic cache
│   │   │   ├── fallback.go     # Fallback chain execution
│   │   │   └── logger.go       # Async request logging
│   │   ├── provider/
│   │   │   ├── adapter.go      # Common interface
│   │   │   ├── openai.go
│   │   │   ├── anthropic.go
│   │   │   ├── google.go
│   │   │   ├── together.go
│   │   │   ├── groq.go
│   │   │   └── mistral.go
│   │   ├── service/
│   │   │   ├── routing.go
│   │   │   ├── cache.go
│   │   │   └── encryption.go   # API key encryption (AES-256-GCM)
│   │   └── store/
│   │       └── postgres.go
│   │
│   ├── cost/                   # COST MODULE
│   │   ├── handler/
│   │   │   ├── events.go
│   │   │   ├── analytics.go
│   │   │   ├── budgets.go
│   │   │   └── models.go
│   │   ├── service/
│   │   │   ├── tracker.go
│   │   │   ├── budget.go
│   │   │   └── analytics.go
│   │   └── store/
│   │       └── postgres.go
│   │
│   ├── auth/                   # SHARED AUTH
│   │   ├── github_oauth.go
│   │   ├── jwt.go
│   │   ├── apikey.go
│   │   └── hash.go
│   │
│   ├── model/                  # SHARED MODELS
│   │   ├── user.go
│   │   ├── organization.go
│   │   └── apikey.go
│   │
│   └── worker/                 # BACKGROUND WORKERS
│       ├── ingest_writer.go    # NATS → ClickHouse batch writer
│       ├── pattern_matcher.go  # Match sessions against failure patterns
│       ├── alert_evaluator.go  # Check alert rules
│       ├── test_executor.go    # Async test run execution
│       ├── budget_checker.go   # Periodic budget enforcement
│       └── cache_cleanup.go    # Expire semantic cache entries
│
├── migrations/
│   ├── postgres/
│   │   ├── 001_users_orgs.up.sql
│   │   ├── 001_users_orgs.down.sql
│   │   ├── 002_trace.up.sql
│   │   ├── 002_trace.down.sql
│   │   ├── 003_test.up.sql
│   │   ├── 003_test.down.sql
│   │   ├── 004_guard.up.sql
│   │   ├── 004_guard.down.sql
│   │   ├── 005_route.up.sql
│   │   ├── 005_route.down.sql
│   │   ├── 006_cost.up.sql
│   │   └── 006_cost.down.sql
│   └── clickhouse/
│       ├── 001_trace.up.sql
│       ├── 001_trace.down.sql
│       ├── 002_healing.up.sql
│       └── 002_healing.down.sql
│
├── sdk/
│   ├── python/
│   │   ├── pyproject.toml
│   │   ├── agentstack/
│   │   │   ├── __init__.py       # agentstack.init(), agentstack.protect()
│   │   │   ├── client.py         # HTTP client
│   │   │   ├── session.py        # Session context manager
│   │   │   ├── span.py           # Span tracking
│   │   │   ├── trace.py          # @trace decorator
│   │   │   ├── healing.py        # HealingEngine, HealingConfig
│   │   │   ├── guard.py          # agentstack.guard.check()
│   │   │   ├── cost.py           # agentstack.cost.track()
│   │   │   ├── batch.py          # Batch event sender
│   │   │   └── instruments/
│   │   │       ├── openai.py
│   │   │       ├── anthropic.py
│   │   │       ├── crewai.py
│   │   │       ├── langgraph.py
│   │   │       └── langchain.py
│   │   └── tests/
│   └── typescript/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── client.ts
│       │   ├── session.ts
│       │   ├── span.ts
│       │   ├── trace.ts
│       │   ├── healing.ts
│       │   ├── guard.ts
│       │   ├── cost.ts
│       │   ├── types.ts
│       │   └── instruments/
│       │       ├── openai.ts
│       │       └── anthropic.ts
│       └── tests/
│
├── web/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Landing page
│   │   ├── globals.css              # Design system
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── callback/page.tsx
│   │   └── (dashboard)/
│   │       ├── layout.tsx           # Dashboard with sidebar
│   │       ├── overview/page.tsx
│   │       ├── sessions/
│   │       │   ├── page.tsx
│   │       │   └── [id]/page.tsx    # Session detail + replay
│   │       ├── healing/page.tsx
│   │       ├── agents/page.tsx
│   │       ├── analytics/page.tsx
│   │       ├── patterns/page.tsx
│   │       ├── alerts/page.tsx
│   │       ├── test/
│   │       │   ├── page.tsx
│   │       │   ├── suites/[id]/page.tsx
│   │       │   └── runs/[id]/page.tsx
│   │       ├── cost/
│   │       │   ├── page.tsx
│   │       │   ├── compare/page.tsx
│   │       │   └── budgets/page.tsx
│   │       ├── guard/
│   │       │   ├── page.tsx
│   │       │   └── rules/[id]/page.tsx
│   │       ├── route/
│   │       │   ├── page.tsx
│   │       │   └── providers/page.tsx
│   │       └── settings/
│   │           ├── page.tsx
│   │           ├── api-keys/page.tsx
│   │           ├── team/page.tsx
│   │           └── billing/page.tsx
│   ├── components/
│   │   ├── ui/                      # shadcn/ui components
│   │   ├── sidebar.tsx
│   │   ├── metric-card.tsx
│   │   ├── session-replay.tsx       # D3.js Gantt chart
│   │   ├── reliability-score.tsx    # Circular gauge
│   │   └── skeleton.tsx
│   └── lib/
│       ├── api.ts
│       ├── types.ts
│       ├── utils.ts
│       └── animations.ts           # Framer Motion presets
│
├── cli/
│   ├── main.go
│   ├── test.go                     # agentstack test run/status/gate
│   └── cost.go                     # agentstack cost summary
│
├── seed/
│   ├── failure_patterns.json       # 50+ agent failure patterns
│   ├── evaluators.json             # 15 pre-built evaluators
│   ├── guardrails.json             # 8 pre-built guardrails
│   └── model_pricing.json          # Current model prices
│
└── deploy/
    ├── Dockerfile                  # Multi-stage Go build
    ├── Dockerfile.gateway          # Gateway binary
    ├── Dockerfile.web              # Next.js build
    └── docker-compose.prod.yml
```

---

## 5. Build Order

Build in this EXACT order. Each phase depends on the previous.

### Phase 1: Foundation (Days 1-3)

Read: This CLAUDE.md

1. Initialize Go module: `go mod init github.com/agentstack/agentstack`
2. Create docker-compose.yml with PostgreSQL, ClickHouse, Redis, NATS
3. Create .env.example with all environment variables
4. Create Makefile with: dev, build, test, migrate, seed targets
5. Create cmd/server/main.go — basic HTTP server with health check
6. Create cmd/migrate/main.go — migration runner
7. Create internal/config/config.go — environment-based config
8. Create internal/server/ — HTTP server setup with chi router
9. Create internal/auth/ — GitHub OAuth + API key auth + JWT
10. Create internal/model/ — shared User, Organization, APIKey models
11. Write ALL PostgreSQL migrations (001-006)
12. Write ALL ClickHouse migrations (001-002)
13. Run migrations, verify tables exist
14. Scaffold Next.js app: `npx create-next-app@latest web --typescript --tailwind --app`
15. Install web deps: framer-motion, lucide-react, d3, shadcn/ui
16. Set up design system in globals.css
17. Create animation utilities in lib/animations.ts
18. Build sidebar component
19. Build dashboard layout with sidebar

### Phase 2: Trace Module (Days 4-7)

Read: `specs/spec-core.md` (Trace sections)

1. Build Trace module: handlers, services, stores
2. Ingestion API (sessions, spans, events, batch) — async via NATS
3. NATS consumer worker that batch-writes to ClickHouse
4. Query API (sessions list, session detail, session replay)
5. Analytics API (failure rate, cost, reliability score)
6. Failure pattern matching engine + seed 50 patterns
7. Alert rules CRUD + alert evaluation worker
8. Agent definitions CRUD
9. Dashboard: Overview page (4 metric cards, 2 charts, sessions table)
10. Dashboard: Sessions list page
11. Dashboard: Session detail page with D3.js timeline replay
12. Dashboard: Analytics page
13. Dashboard: Patterns page
14. Dashboard: Alerts page
15. Dashboard: Agents page
16. Python SDK: client, session, span, @trace decorator, batch sender
17. TypeScript SDK: client, session, span, trace wrapper
18. Auto-instrumentation: OpenAI (Python + TS), CrewAI (Python), Anthropic (Python)

### Phase 3: Shield Module (Days 8-10)

Read: `specs/spec-core.md` (Shield sections)

1. Build HealingEngine in Python SDK (healing.py)
2. Build HealingEngine in TypeScript SDK (healing.ts)
3. Integrate healing into @trace decorator (healing=True param)
4. Context variable propagation for auto-instrumentation + healing
5. ClickHouse healing_events table + session columns
6. Healing ingestion API
7. Healing analytics API
8. Healing query API (per session)
9. Dashboard: Healing page (intervention metrics, healing-over-time chart, events table)
10. Update Overview page with healing metric cards
11. Update session replay with healing intervention markers

### Phase 4: Test Module (Days 11-14)

Read: `specs/spec-test-cost.md` (Test sections)

1. Build Test module: handlers, services, stores
2. Test suites CRUD
3. Test cases CRUD
4. Evaluator configs + seed 15 pre-built evaluators
5. Evaluator engine (6 LLM-judge + 6 programmatic + 3 composite)
6. Test runner service (async execution via worker)
7. Test runs API (create, status, results)
8. Auto-regression: create test case from production session
9. CI/CD endpoint (POST /v1/test/ci/run)
10. CLI tool: agentstack test run/status/gate
11. Dashboard: Test overview page
12. Dashboard: Suite detail page
13. Dashboard: Run detail page (progress bar, results table, evaluator scores)

### Phase 5: Guard Module (Days 15-17)

Read: `specs/spec-route-guard.md` (Guard sections)

1. Build Guard module: handlers, services, stores
2. Guardrail engine (parallel execution, short-circuit on block)
3. PII detector (regex-based, fast)
4. Prompt injection detector (pattern + LLM hybrid)
5. Toxicity filter (LLM-judge)
6. Hallucination detector (LLM-judge)
7. Topic guard (LLM-judge)
8. Code execution guard (regex)
9. Length guard (programmatic)
10. Custom policy guard (user-defined LLM prompt)
11. Seed 8 pre-built guardrails
12. Guard check API (POST /v1/guard/check)
13. Guard events API
14. Guard analytics API
15. Python SDK: agentstack.guard.check()
16. Dashboard: Guard overview page
17. Dashboard: Guard rule detail + test UI

### Phase 6: Route Module (Days 18-21)

Read: `specs/spec-route-guard.md` (Route sections)

1. Build Route module: handlers, services, stores
2. Provider adapter interface
3. Provider implementations: OpenAI, Anthropic, Google, Together, Groq, Mistral
4. Gateway proxy server (cmd/gateway/main.go, port 8090)
5. OpenAI-compatible /v1/chat/completions endpoint
6. OpenAI-compatible /v1/embeddings endpoint
7. Routing engine (rule-based, cost-based, glob matching)
8. Fallback chain execution
9. Semantic cache (SHA-256 exact match via Redis)
10. Async request logging
11. Guard integration in proxy pipeline (input + output guardrails)
12. Provider management API (CRUD, encrypted keys)
13. Routing rules API
14. Fallback chains API
15. Cache stats/purge API
16. Gateway analytics API
17. Dashboard: Route overview page
18. Dashboard: Provider management page

### Phase 7: Cost Module (Days 22-24)

Read: `specs/spec-test-cost.md` (Cost sections)

1. Build Cost module: handlers, services, stores
2. Cost event recording API
3. Cost analytics API (summary, trends, per-outcome, compare-models, top-spenders)
4. Budget policies CRUD
5. Budget enforcer worker (periodic checks)
6. Model pricing table + seed data
7. Cost alerts
8. CLI: agentstack cost summary/budgets
9. Dashboard: Cost overview page (spend, avg cost/session, cost/outcome, budget utilization)
10. Dashboard: Model comparison page (cost vs quality, what-if calculator)
11. Dashboard: Budget policies page (progress bars, alert history)

### Phase 8: Landing Page + Polish (Days 25-28)

1. Landing page with: animated hero, 6-module grid, comparison table, pricing cards, CTA
2. API documentation page
3. Settings pages (general, API keys, team, billing)
4. Responsive design pass (mobile sidebar, stacking, scroll)
5. Error handling pass (all API errors consistent, all forms validate)
6. Loading states pass (skeleton loading on every page)
7. Empty states pass (custom empty state per page)

---

## 6. Spec Files

Read each spec when starting the corresponding phase. DO NOT read all specs upfront — they are very long.

| Phase | Spec File | Covers |
|-------|-----------|--------|
| Phase 2 (Trace) | `specs/spec-core.md` | Trace data models, API endpoints, SDK code, session replay |
| Phase 3 (Shield) | `specs/spec-core.md` | Shield healing engine, healing events, intervention types |
| Phase 4 (Test) | `specs/spec-test-cost.md` | Evaluators, test suites, CI/CD gates, regression tests |
| Phase 5 (Guard) | `specs/spec-route-guard.md` | Guardrail types, PII detection, guard engine, check API |
| Phase 6 (Route) | `specs/spec-route-guard.md` | Gateway proxy, provider adapters, routing, caching, failover |
| Phase 7 (Cost) | `specs/spec-test-cost.md` | Cost events, budgets, model pricing, analytics |

---

## 7. Shared Infrastructure

### Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: agentstack
      POSTGRES_PASSWORD: agentstack_dev
      POSTGRES_DB: agentstack
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agentstack"]
      interval: 5s
      timeout: 5s
      retries: 5

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports: ["9000:9000", "8123:8123"]
    volumes:
      - chdata:/var/lib/clickhouse
    healthcheck:
      test: ["CMD", "clickhouse-client", "--query", "SELECT 1"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  nats:
    image: nats:latest
    ports: ["4222:4222", "8222:8222"]
    command: ["--jetstream", "--http_port", "8222"]
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8222/healthz"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
  chdata:
```

### Ports

| Service | Port | Purpose |
|---------|------|---------|
| API Server | 8080 | Unified REST API for all modules |
| Gateway Proxy | 8090 | OpenAI-compatible LLM proxy |
| Next.js Dashboard | 3000 | Web UI |
| PostgreSQL | 5432 | Config/user database |
| ClickHouse (native) | 9000 | Time-series data |
| ClickHouse (HTTP) | 8123 | ClickHouse HTTP interface |
| Redis | 6379 | Cache, rate limiting, sessions |
| NATS | 4222 | Event streaming |
| NATS Monitoring | 8222 | NATS health/metrics |

### Environment Variables

```
# Server
PORT=8080
GATEWAY_PORT=8090
ENVIRONMENT=development

# Database
DATABASE_URL=postgresql://agentstack:agentstack_dev@localhost:5432/agentstack?sslmode=disable
CLICKHOUSE_URL=clickhouse://localhost:9000/agentstack
REDIS_URL=redis://localhost:6379
NATS_URL=nats://localhost:4222

# Auth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
JWT_SECRET=dev-secret-change-in-production

# Frontend
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8080

# Email (for alerts)
SENDGRID_API_KEY=
FROM_EMAIL=alerts@agentstack.dev

# Encryption (for provider API keys in Route module)
ENCRYPTION_KEY= # 32-byte hex string for AES-256-GCM
```

---

## 8. Design System

Dark theme, premium feel. Applied to ALL dashboard pages.

### Colors

```css
--bg-primary: #0a0a0b;
--bg-secondary: #111113;
--bg-tertiary: #18181b;
--bg-elevated: #1e1e22;
--bg-hover: #27272a;
--border-subtle: rgba(255,255,255,0.06);
--border-default: rgba(255,255,255,0.1);
--text-primary: #fafafa;
--text-secondary: #a1a1aa;
--text-tertiary: #71717a;
--accent-blue: #3b82f6;
--accent-green: #22c55e;
--accent-red: #ef4444;
--accent-amber: #f59e0b;
--accent-purple: #a855f7;
--healing-blue: #38bdf8;
```

### Status Dots

- **Completed:** green filled dot
- **Failed:** red filled dot with subtle pulse
- **Running:** blue animated spinning dot
- **Timeout:** amber filled dot
- **Healed:** cyan (#38bdf8) filled dot with glow pulse

### Typography

- **UI font:** Inter (300-700 weights)
- **Code font:** JetBrains Mono (400-500 weights)
- **Headings:** font-semibold
- **Body:** font-normal, text-secondary
- **Labels:** text-xs uppercase tracking-wider text-tertiary

### Component Patterns

- **Metric cards:** bg-elevated, border-subtle, 12px radius, count-up animation on mount, sparkline
- **Tables:** no cell borders, hover bg-hover, skeleton loading, uppercase header
- **Buttons:** scale(0.98) on press
- **Modals:** backdrop blur(8px) + scaleIn
- **Toasts:** slide from top-right, auto-dismiss with progress bar
- **Tabs:** animated underline via Framer Motion layoutId

### Animation Presets

- **fadeIn:** opacity 0 to 1, y 8 to 0, 0.3s ease
- **stagger:** 0.05s delay between children
- **count-up:** numbers animate from 0 to value on mount
- **skeleton:** shimmer gradient sweep left-to-right
- **pulse-glow:** box-shadow 0 to 4px to 0 with healing-blue at 15% opacity

---

## 9. Integration Points

How modules talk to each other:

| Source | Target | Integration |
|--------|--------|-------------|
| Shield | Trace | Healing events are stored alongside trace events. Session replay shows healing intervention markers inline. |
| Shield | Cost | When Shield downgrades a model (cost circuit breaker), the downgrade is tracked as a cost event. |
| Guard | Route | Guard rules run as middleware in the gateway proxy pipeline (both input and output checks). |
| Cost | Route | Gateway request logs feed the cost tracking system automatically. |
| Test | Trace | Production trace sessions can be converted to test cases for regression testing. |
| Test | Guard | Test suites can include guardrail evaluation checks as part of test cases. |

---

## 10. What NOT to Build

- No voice agent support
- No no-code agent builder
- No human evaluation pipelines (Phase 2)
- No LLM gateway marketplace
- No SSO/SAML (enterprise feature, later)
- No multi-region deployment
- No self-hosted installer (later)
- No Java/Go SDKs (later)
- No data connectors (Snowflake, BigQuery — later)
- No prompt management/versioning (Langfuse has this, we skip)

---

## 11. Revenue Model

| Tier | Price | Limits |
|------|-------|--------|
| Self-Hosted | Free forever | Open-source, all features |
| Cloud | $49/mo | Managed hosting, 100K events/mo, 30-day retention, 3 members |
| Team | $199/mo | 1M events/mo, 90-day retention, 10 members, priority support |
| Enterprise | Custom | Unlimited, SSO, on-prem, SLA, custom integrations |

---

## 12. Critical Coding Rules

1. All API handlers validate input and return proper HTTP status codes with consistent JSON error format: `{"error": {"code": "...", "message": "..."}}`.
2. All database queries use parameterized queries — NO string interpolation.
3. All monetary values are integers (cents) — NEVER floating point.
4. All secrets (API keys, provider keys) are hashed or encrypted before storage.
5. ClickHouse is append-only — NEVER update rows.
6. NATS is used for async ingestion — NEVER block API responses on ClickHouse writes.
7. Gateway proxy MUST add <5ms overhead — use in-memory caching, async logging.
8. PII detection is regex-based — NEVER use LLM for PII (too slow for gateway).
9. LLM-based guards use the user's configured API key, NOT ours.
10. Rate limiting uses Redis sliding window algorithm.
11. Audit log writes are async — NEVER fail a request because logging failed.
12. Test runs execute asynchronously via background worker.
13. Budget enforcement checks run every 60 seconds.

---

## 14. Verification Workflow (MANDATORY)

You have access to Chrome DevTools MCP and Playwright MCP. USE THEM.

### After Building Each Dashboard Page:

1. **Take a screenshot** using Playwright or Chrome DevTools to verify the page renders correctly
2. **Check for visual issues** — alignment, spacing, colors matching the design system
3. **Test at mobile width** — resize to 375px width, take screenshot, verify responsive layout
4. **Run Lighthouse audit** using Chrome DevTools for performance and accessibility scores
5. **Check console** for JavaScript errors or React warnings
6. **Fix any issues** before moving to the next page

### After Building Each API Endpoint:

1. Test with curl — happy path + error cases
2. Verify proper HTTP status codes
3. Verify consistent JSON error format
4. Test rate limiting

### After Building SDK Features:

1. Write and run a test script
2. Verify data appears in the dashboard
3. Test error handling

### Quality Gate — End of Each Phase:

Before moving to the next phase:
1. All tests pass (`make test`, `pytest`, `npm test`)
2. All dashboard pages render without console errors
3. Take a screenshot of each new page as proof
4. Verify the docker services are healthy (`docker compose ps`)

---

## 15. Production UI/UX Checklist (Per Page)

Every dashboard page MUST have ALL of these before you move on:

- [ ] Dark theme applied correctly (no white backgrounds, no default light styles)
- [ ] Loading state with skeleton shimmer (NOT a spinner)
- [ ] Empty state with icon + message + CTA
- [ ] Error state with red banner + retry button
- [ ] Framer Motion fadeIn animation on page mount
- [ ] Metric cards with animated count-up numbers (if applicable)
- [ ] Tables with hover state, no cell borders, uppercase headers
- [ ] Responsive at 1440px, 1024px, 768px, 375px
- [ ] No console errors or warnings
- [ ] Proper page title in browser tab
- [ ] Breadcrumb or back navigation where needed

---

## 16. shadcn/ui Setup

Initialize shadcn/ui early in Phase 1:

```bash
cd web
npx shadcn@latest init
# Choose: TypeScript, tailwind.config.ts, globals.css, New York style, slate base color

# Add required components:
npx shadcn@latest add button input select dialog dropdown-menu table tabs toast badge card skeleton separator avatar tooltip popover command sheet
```

Override the default theme to dark in `tailwind.config.ts` — set `darkMode: 'class'` and add `dark` class to the html element in layout.tsx.

---

## 17. Go Module Dependencies

```
github.com/go-chi/chi/v5
github.com/go-chi/cors
github.com/jackc/pgx/v5
github.com/ClickHouse/clickhouse-go/v2
github.com/nats-io/nats.go
github.com/redis/go-redis/v9
github.com/golang-jwt/jwt/v5
github.com/golang-migrate/migrate/v4
github.com/google/uuid
github.com/go-playground/validator/v10
golang.org/x/crypto
```

---

## 18. Next.js Dependencies

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.400.0",
    "d3": "^7.0.0",
    "@types/d3": "^7.0.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  }
}
