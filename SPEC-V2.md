# AgentStack V2 — Feature Expansion Spec

**Version:** 2.0
**Date:** 2026-03-20
**Status:** Ready for Implementation
**Prerequisite:** All 6 V1 modules (Shield, Trace, Test, Guard, Route, Cost) built and functional

---

## PART 1: USER FLOW ANALYSIS

### The Core Loop

Every feature in AgentStack must serve this loop:

```
DEVELOP → DEPLOY → OBSERVE → HEAL → IMPROVE → (repeat)
```

Mapped to modules:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   DEVELOP                    DEPLOY                             │
│   ┌──────────────────┐      ┌──────────────────────┐            │
│   │ Prompt Mgmt      │─────▶│ Route (gateway)      │            │
│   │ Playground        │      │ Guard (guardrails)    │            │
│   │ Dataset Mgmt      │      │ OTel ingest           │            │
│   └──────────────────┘      └──────────┬───────────┘            │
│           ▲                            │                        │
│           │                            ▼                        │
│   IMPROVE                    OBSERVE                            │
│   ┌──────────────────┐      ┌──────────────────────┐            │
│   │ Test (with        │◀─────│ Trace (sessions)     │            │
│   │   datasets)       │      │ Cost (spend)          │            │
│   │ Human Review      │      │ Webhooks (alerts)     │            │
│   │ Prompt iteration  │      └──────────┬───────────┘            │
│   └──────────────────┘                  │                        │
│           ▲                            ▼                        │
│           │                   HEAL                              │
│           │                  ┌──────────────────────┐            │
│           └──────────────────│ Shield (auto-heal)    │            │
│                              │ Alerts → Webhooks     │            │
│                              └──────────────────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Feature-by-Feature Verdict

#### KEEP — Directly serves the loop

| # | Feature | Loop Stage | Verdict | Reasoning |
|---|---------|-----------|---------|-----------|
| 1 | **Prompt Management + Versioning** | DEVELOP | **KEEP** | Prompts are the primary artifact developers iterate on. Version control for prompts closes the loop from IMPROVE back to DEVELOP. Without this, prompt changes are untracked code edits — the feedback loop is broken. |
| 2 | **Playground/Prompt Testing UI** | DEVELOP | **KEEP** | The fastest inner loop. Developer changes a prompt, tests it immediately against real models, sees results. Without a playground, iteration requires redeploying the agent — friction kills the loop. |
| 3 | **Dataset Management for Evals** | IMPROVE | **KEEP** | Test module is already built, but without managed datasets, every test run requires ad-hoc data. Datasets let you capture production failures and replay them as test cases. This is the bridge from OBSERVE to IMPROVE. |
| 4 | **OpenTelemetry Native Support** | DEPLOY/OBSERVE | **KEEP** | Most production teams already have OTel infrastructure. If AgentStack cannot ingest OTel spans, teams must run two tracing systems. This is an adoption blocker. |
| 7 | **Webhook/Notification Integrations** | HEAL | **KEEP** | Alerts already exist in Trace, but they currently go nowhere actionable. Slack/PagerDuty webhooks make Shield healing events and Guard violations visible to the team in real-time. Without notifications, the OBSERVE stage is passive — you only find problems when you open the dashboard. |

#### CUT — Does not serve the core loop tightly enough

| # | Feature | Proposed Stage | Verdict | Reasoning |
|---|---------|---------------|---------|-----------|
| 5 | **Documentation Site** | None | **CUT** | A docs site is a marketing/adoption concern, not a product loop concern. It does not appear in the develop-deploy-observe-heal-improve cycle. Build it when you need to grow users, not when you need to tighten the product loop. Ship a basic `/docs` page with the existing Next.js app if needed. |
| 6 | **Agent Workflow Graph Visualization** | OBSERVE | **CUT** | Nice visualization, but the session replay timeline (already built) serves the same debugging purpose. A DAG visualizer is a "looks impressive in demos" feature that doesn't change what actions the user takes. The data is already in Trace spans — the visualization is cosmetic. |
| 8 | **Human Evaluation Pipelines** | IMPROVE | **CUT** | Human-in-the-loop review is important for teams with dedicated QA, but it's a workflow tool, not a core platform primitive. It requires building task queues, assignment logic, reviewer UIs, inter-annotator agreement — essentially a separate product. The existing Test module with LLM-as-judge evaluators covers 90% of the use case. Revisit after V2 ships. |
| 9 | **RAG Evaluation Metrics** | IMPROVE | **CUT** | RAG-specific metrics (faithfulness, context relevance, answer relevance) are evaluator types, not a separate feature. They belong as additional evaluator configs in the existing Test module. Add them as seed evaluators, not as a new module. (We will add RAG evaluator seeds in the Dataset Management work.) |
| 10 | **Compliance/Audit Logging** | OBSERVE | **CUT** | Audit logging is an enterprise compliance requirement, not a developer feedback loop feature. The existing Trace module already captures all API interactions. A formal audit log with immutable storage, retention policies, and compliance reports is enterprise-tier work. Ship it when enterprise customers ask for it. |

### Final V2 Scope: 5 Features

```
Phase 9:  Prompt Management + Versioning      (DEVELOP)
Phase 10: Playground / Prompt Testing UI       (DEVELOP)
Phase 11: Dataset Management for Evals         (IMPROVE)
Phase 12: OpenTelemetry Native Support         (DEPLOY/OBSERVE)
Phase 13: Webhook/Notification Integrations    (HEAL/OBSERVE)
```

These 5 features, combined with the existing 6 modules, create a complete closed loop with zero dead ends.

---

## PART 2: SPECIFICATION

---

## 1. Build Order

Execute these phases sequentially. Each phase depends on the previous.

```
Phase 9:  Prompt Management + Versioning         ~3 days
Phase 10: Playground / Prompt Testing UI          ~2 days
Phase 11: Dataset Management for Evals            ~2 days
Phase 12: OpenTelemetry Native Support             ~2 days
Phase 13: Webhook/Notification Integrations        ~2 days
```

**Total: ~11 days**

---

## 2. Project Structure — New Files Only

All new code follows the existing handler → service → store pattern. New files are listed below; existing files that need modification are noted inline in each phase.

```
agentstack/
├── internal/
│   ├── prompt/                          # PROMPT MODULE (NEW)
│   │   ├── handler/
│   │   │   ├── prompts.go              # Prompt CRUD
│   │   │   ├── versions.go            # Version management
│   │   │   └── playground.go          # Playground execution
│   │   ├── service/
│   │   │   ├── prompt.go              # Prompt business logic
│   │   │   ├── version.go            # Version diffing, rollback
│   │   │   ├── renderer.go           # Variable interpolation engine
│   │   │   └── executor.go           # Playground execution (calls LLM)
│   │   └── store/
│   │       └── postgres.go            # Prompt + version queries
│   │
│   ├── dataset/                         # DATASET MODULE (NEW)
│   │   ├── handler/
│   │   │   ├── datasets.go            # Dataset CRUD
│   │   │   └── items.go              # Dataset item CRUD + import/export
│   │   ├── service/
│   │   │   ├── dataset.go            # Dataset business logic
│   │   │   ├── importer.go           # CSV/JSON/JSONL import
│   │   │   └── exporter.go           # Export to CSV/JSON
│   │   └── store/
│   │       └── postgres.go            # Dataset + item queries
│   │
│   ├── otel/                            # OTEL INGEST (NEW)
│   │   ├── handler/
│   │   │   └── otlp.go               # OTLP HTTP + gRPC receivers
│   │   ├── service/
│   │   │   ├── translator.go         # OTel span → AgentStack span
│   │   │   └── attributes.go        # Semantic convention mapping
│   │   └── proto/                     # Compiled protobuf (vendored)
│   │       └── ... (OTLP proto files)
│   │
│   ├── webhook/                         # WEBHOOK MODULE (NEW)
│   │   ├── handler/
│   │   │   ├── webhooks.go            # Webhook endpoint CRUD
│   │   │   └── deliveries.go         # Delivery log query
│   │   ├── service/
│   │   │   ├── dispatcher.go         # Async webhook delivery
│   │   │   ├── slack.go              # Slack message formatting
│   │   │   └── pagerduty.go          # PagerDuty event formatting
│   │   └── store/
│   │       └── postgres.go            # Webhook + delivery queries
│   │
│   └── worker/
│       ├── webhook_sender.go          # NATS consumer → HTTP delivery (NEW)
│       └── ... (existing workers)
│
├── migrations/
│   └── postgres/
│       ├── 007_prompts.up.sql          # NEW
│       ├── 007_prompts.down.sql        # NEW
│       ├── 008_datasets.up.sql         # NEW
│       ├── 008_datasets.down.sql       # NEW
│       ├── 009_webhooks.up.sql         # NEW
│       └── 009_webhooks.down.sql       # NEW
│
├── web/
│   └── app/
│       └── (dashboard)/
│           ├── prompts/                 # NEW
│           │   ├── page.tsx            # Prompt library
│           │   └── [id]/
│           │       ├── page.tsx        # Prompt detail + version history
│           │       └── playground/
│           │           └── page.tsx    # Playground for this prompt
│           ├── playground/              # NEW
│           │   └── page.tsx            # Standalone playground (no prompt)
│           ├── datasets/                # NEW
│           │   ├── page.tsx            # Dataset library
│           │   └── [id]/
│           │       └── page.tsx        # Dataset detail + items
│           └── settings/
│               └── webhooks/
│                   └── page.tsx        # NEW — Webhook configuration
│
│   └── components/
│       ├── prompt/                      # NEW
│       │   ├── prompt-card.tsx
│       │   ├── prompt-editor.tsx       # Monaco-style editor with variable highlighting
│       │   ├── version-history.tsx     # Timeline of versions with diffs
│       │   ├── version-diff.tsx        # Side-by-side diff view
│       │   ├── variable-input.tsx      # Dynamic variable form
│       │   └── create-prompt-dialog.tsx
│       ├── playground/                  # NEW
│       │   ├── playground-panel.tsx    # Split-pane: editor left, output right
│       │   ├── model-selector.tsx     # Model + provider picker
│       │   ├── parameter-controls.tsx # Temperature, max tokens, etc.
│       │   ├── output-viewer.tsx      # Streamed output with token count
│       │   └── comparison-view.tsx    # Side-by-side model comparison
│       ├── dataset/                     # NEW
│       │   ├── dataset-card.tsx
│       │   ├── item-table.tsx
│       │   ├── import-dialog.tsx      # CSV/JSON upload
│       │   ├── create-dataset-dialog.tsx
│       │   └── link-suite-dialog.tsx  # Link dataset to test suite
│       └── webhook/                     # NEW
│           ├── webhook-card.tsx
│           ├── webhook-form.tsx
│           ├── delivery-log-table.tsx
│           └── test-webhook-button.tsx
```

---

## 3. Phase 9: Prompt Management + Versioning

### 3.1 Why

Prompts are the primary artifact in AI development. Today, prompt changes are untracked code edits scattered across codebases. Prompt Management gives developers a central registry of prompts with full version history, variable templating, and the ability to update prompts without redeploying code. This closes the loop: observe a problem in Trace → improve the prompt in the Prompt module → test it in Playground → deploy the new version via SDK.

### 3.2 Data Models

#### Prompt

```go
// internal/prompt/handler/ and model package
type Prompt struct {
    ID            uuid.UUID       `json:"id" db:"id"`
    OrgID         uuid.UUID       `json:"org_id" db:"org_id"`
    Slug          string          `json:"slug" db:"slug"`            // unique per org, URL-safe identifier
    Name          string          `json:"name" db:"name"`
    Description   string          `json:"description" db:"description"`
    ActiveVersion int             `json:"active_version" db:"active_version"` // currently deployed version number
    Tags          []string        `json:"tags" db:"tags"`
    Metadata      json.RawMessage `json:"metadata" db:"metadata"`   // arbitrary user metadata
    CreatedAt     time.Time       `json:"created_at" db:"created_at"`
    UpdatedAt     time.Time       `json:"updated_at" db:"updated_at"`
}
```

#### PromptVersion

```go
type PromptVersion struct {
    ID           uuid.UUID       `json:"id" db:"id"`
    PromptID     uuid.UUID       `json:"prompt_id" db:"prompt_id"`
    OrgID        uuid.UUID       `json:"org_id" db:"org_id"`
    Version      int             `json:"version" db:"version"`       // auto-incrementing per prompt
    Body         string          `json:"body" db:"body"`             // the prompt template text
    Model        string          `json:"model" db:"model"`           // suggested model (e.g. "gpt-4o")
    Variables    json.RawMessage `json:"variables" db:"variables"`   // JSON schema for template variables
    SystemPrompt string          `json:"system_prompt" db:"system_prompt"` // optional system message
    Config       json.RawMessage `json:"config" db:"config"`         // temperature, max_tokens, etc.
    ChangeNote   string          `json:"change_note" db:"change_note"` // what changed
    CreatedBy    string          `json:"created_by" db:"created_by"` // user ID or API key prefix
    CreatedAt    time.Time       `json:"created_at" db:"created_at"`
}
```

### 3.3 Database Schema

**File: `migrations/postgres/007_prompts.up.sql`**

```sql
-- =============================================
-- AgentStack Prompt Management — Database Schema
-- =============================================

CREATE TABLE prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    active_version INTEGER NOT NULL DEFAULT 1,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, slug)
);

CREATE INDEX idx_prompts_org ON prompts(org_id);
CREATE INDEX idx_prompts_slug ON prompts(org_id, slug);
CREATE INDEX idx_prompts_tags ON prompts USING GIN(tags);

CREATE TABLE prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    version INTEGER NOT NULL,
    body TEXT NOT NULL,
    model TEXT DEFAULT '',
    variables JSONB DEFAULT '{}',
    system_prompt TEXT DEFAULT '',
    config JSONB DEFAULT '{}',
    change_note TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(prompt_id, version)
);

CREATE INDEX idx_prompt_versions_prompt ON prompt_versions(prompt_id);
CREATE INDEX idx_prompt_versions_lookup ON prompt_versions(prompt_id, version);

-- Variable schema format in `variables` column:
-- {
--   "variables": [
--     {"name": "user_name", "type": "string", "required": true, "default": ""},
--     {"name": "context", "type": "string", "required": true, "default": ""},
--     {"name": "max_items", "type": "number", "required": false, "default": 5}
--   ]
-- }

-- Config format in `config` column:
-- {
--   "temperature": 0.7,
--   "max_tokens": 1024,
--   "top_p": 1.0,
--   "stop_sequences": []
-- }
```

**File: `migrations/postgres/007_prompts.down.sql`**

```sql
DROP TABLE IF EXISTS prompt_versions;
DROP TABLE IF EXISTS prompts;
```

### 3.4 API Endpoints

All endpoints scoped to org via API key authentication. Handler file noted in parentheses.

#### Prompt CRUD (`internal/prompt/handler/prompts.go`)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `POST` | `/v1/prompts` | Create a new prompt (also creates version 1) | 201 Created |
| `GET` | `/v1/prompts` | List prompts for org | 200 OK (paginated) |
| `GET` | `/v1/prompts/{id}` | Get prompt with active version body | 200 OK |
| `GET` | `/v1/prompts/slug/{slug}` | Get prompt by slug (SDK uses this) | 200 OK |
| `PATCH` | `/v1/prompts/{id}` | Update prompt metadata (name, description, tags) | 200 OK |
| `DELETE` | `/v1/prompts/{id}` | Delete prompt and all versions | 204 No Content |

**Create Prompt Request:**

```json
{
    "slug": "customer-support-reply",
    "name": "Customer Support Reply Generator",
    "description": "Generates customer support email replies",
    "body": "You are a helpful support agent for {{company_name}}.\n\nCustomer message: {{customer_message}}\n\nWrite a professional reply.",
    "model": "gpt-4o",
    "system_prompt": "You are a customer support specialist.",
    "variables": {
        "variables": [
            {"name": "company_name", "type": "string", "required": true, "default": ""},
            {"name": "customer_message", "type": "string", "required": true, "default": ""}
        ]
    },
    "config": {
        "temperature": 0.7,
        "max_tokens": 512
    },
    "tags": ["support", "email"]
}
```

**List Prompts Response:**

```json
{
    "data": [
        {
            "id": "uuid",
            "slug": "customer-support-reply",
            "name": "Customer Support Reply Generator",
            "description": "...",
            "active_version": 3,
            "tags": ["support", "email"],
            "created_at": "2026-03-20T00:00:00Z",
            "updated_at": "2026-03-20T00:00:00Z"
        }
    ],
    "meta": {"page": 1, "per_page": 50, "total": 12}
}
```

#### Version Management (`internal/prompt/handler/versions.go`)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `POST` | `/v1/prompts/{id}/versions` | Create a new version of a prompt | 201 Created |
| `GET` | `/v1/prompts/{id}/versions` | List all versions of a prompt | 200 OK |
| `GET` | `/v1/prompts/{id}/versions/{version}` | Get a specific version | 200 OK |
| `POST` | `/v1/prompts/{id}/deploy/{version}` | Set a version as active | 200 OK |
| `POST` | `/v1/prompts/{id}/rollback` | Rollback to previous version | 200 OK |

**Create Version Request:**

```json
{
    "body": "You are a helpful support agent for {{company_name}}.\n\nCustomer message: {{customer_message}}\n\nHistory: {{conversation_history}}\n\nWrite a professional, empathetic reply.",
    "model": "gpt-4o",
    "system_prompt": "You are a senior customer support specialist with 10 years of experience.",
    "variables": {
        "variables": [
            {"name": "company_name", "type": "string", "required": true, "default": ""},
            {"name": "customer_message", "type": "string", "required": true, "default": ""},
            {"name": "conversation_history", "type": "string", "required": false, "default": ""}
        ]
    },
    "config": {
        "temperature": 0.5,
        "max_tokens": 1024
    },
    "change_note": "Added conversation history variable and empathy instruction"
}
```

**Version List Response:**

```json
{
    "data": [
        {
            "id": "uuid",
            "prompt_id": "uuid",
            "version": 3,
            "model": "gpt-4o",
            "change_note": "Added conversation history variable and empathy instruction",
            "created_by": "as_sk_prod",
            "created_at": "2026-03-20T00:00:00Z"
        },
        {
            "id": "uuid",
            "prompt_id": "uuid",
            "version": 2,
            "model": "gpt-4o",
            "change_note": "Improved tone",
            "created_by": "as_sk_prod",
            "created_at": "2026-03-19T00:00:00Z"
        }
    ],
    "meta": {"page": 1, "per_page": 50, "total": 3}
}
```

### 3.5 Service Layer

**`internal/prompt/service/prompt.go`** — CRUD operations with org scoping, slug uniqueness validation.

**`internal/prompt/service/version.go`** — Version creation (auto-increment version number per prompt), deploy (update `prompts.active_version`), rollback (deploy version N-1).

**`internal/prompt/service/renderer.go`** — Template variable interpolation engine.

```go
// Renderer interpolates {{variable}} placeholders in prompt templates.
// Uses simple string replacement (not Go templates) for cross-language compatibility.
//
// Example:
//   template: "Hello {{name}}, you have {{count}} items."
//   variables: {"name": "Alice", "count": "5"}
//   result:   "Hello Alice, you have 5 items."
//
// Validation:
//   - Returns error if required variable is missing
//   - Leaves unknown {{placeholders}} as-is (no silent failure)
//   - Validates variable types against schema

func (r *Renderer) Render(template string, variables map[string]interface{}, schema []VariableDefinition) (string, error)
```

### 3.6 SDK Integration

The SDKs fetch prompts at runtime via the API. This allows prompt updates without redeploying code.

**Python SDK addition (`sdk/python/agentstack/prompt.py`):**

```python
# Usage:
# prompt = agentstack.prompt.get("customer-support-reply")
# rendered = prompt.render(company_name="Acme", customer_message="...")
# response = openai.chat.completions.create(
#     model=prompt.model,
#     messages=[
#         {"role": "system", "content": prompt.system_prompt},
#         {"role": "user", "content": rendered}
#     ],
#     **prompt.config
# )
```

**TypeScript SDK addition (`sdk/typescript/src/prompt.ts`):**

```typescript
// Usage:
// const prompt = await agentstack.prompt.get("customer-support-reply");
// const rendered = prompt.render({ company_name: "Acme", customer_message: "..." });
```

Both SDKs cache the prompt locally with a 60-second TTL (configurable). On cache miss, fetch from API. This means prompt updates propagate to all running agents within 60 seconds without restart.

### 3.7 Dashboard Pages

#### Prompt Library Page (`web/app/(dashboard)/prompts/page.tsx`)

- **Header:** "Prompts" title + "Create Prompt" button (opens dialog)
- **Search bar:** Filter by name, slug, or tag
- **Grid layout:** Prompt cards showing name, slug, active version number, tags, last updated
- **Empty state:** Icon (FileText) + "No prompts yet" + "Create your first prompt to get started" + CTA button
- **Loading state:** 6 skeleton cards in grid

#### Prompt Detail Page (`web/app/(dashboard)/prompts/[id]/page.tsx`)

- **Left panel (60%):** Prompt editor (Monaco-style textarea with syntax highlighting for `{{variables}}`)
- **Right panel (40%):** Version history timeline
  - Each version entry: version number, change note, created by, timestamp
  - Click a version to load it into the editor (read-only)
  - "Deploy" button on each version to set as active
  - Active version highlighted with green indicator
- **Top bar:** Prompt name, slug (copyable), "Save New Version" button, "Open in Playground" button
- **Diff view:** Toggle to see side-by-side diff between any two versions (use `diff` library)
- **Variable panel:** Below editor, shows extracted variables with their types and defaults

### 3.8 Components

**`web/components/prompt/prompt-editor.tsx`** — Textarea with:
- Monospace font (JetBrains Mono)
- Syntax highlighting for `{{variable_name}}` (cyan/healing-blue color)
- Line numbers
- Auto-resize height
- Keyboard shortcut: Cmd+S to save new version

**`web/components/prompt/version-history.tsx`** — Vertical timeline:
- Framer Motion stagger animation on load
- Active version has pulsing green dot
- Hover to preview change note
- Click to load version content

**`web/components/prompt/version-diff.tsx`** — Side-by-side diff:
- Green background for additions
- Red background for deletions
- Line-level diffing

### 3.9 Route Registration

In `internal/server/routes.go`, add under authenticated routes:

```go
// Prompt Management
r.Route("/v1/prompts", func(r chi.Router) {
    r.Post("/", promptHandler.Create)
    r.Get("/", promptHandler.List)
    r.Get("/slug/{slug}", promptHandler.GetBySlug)
    r.Get("/{id}", promptHandler.Get)
    r.Patch("/{id}", promptHandler.Update)
    r.Delete("/{id}", promptHandler.Delete)
    r.Post("/{id}/versions", versionHandler.Create)
    r.Get("/{id}/versions", versionHandler.List)
    r.Get("/{id}/versions/{version}", versionHandler.Get)
    r.Post("/{id}/deploy/{version}", versionHandler.Deploy)
    r.Post("/{id}/rollback", versionHandler.Rollback)
})
```

### 3.10 Integration Points

| Source | Target | Integration |
|--------|--------|-------------|
| Prompt | Trace | When SDK fetches a prompt, the prompt_id and version are attached to the trace span as attributes (`agentstack.prompt.id`, `agentstack.prompt.version`). This lets you see which prompt version produced which trace. |
| Prompt | Playground | Playground loads prompts by ID, renders variables, and executes against models. |
| Prompt | Test | Test cases can reference a prompt_id. When the test runs, it uses the active version of the prompt. |

---

## 4. Phase 10: Playground / Prompt Testing UI

### 4.1 Why

The Playground is the inner iteration loop. A developer sees a failure in Trace, opens the prompt in the Playground, tweaks the wording, tests it against multiple models side-by-side, compares outputs, and saves the improved version. Without a Playground, this cycle requires switching to a separate tool (ChatGPT, Anthropic console) and manually copy-pasting prompts.

### 4.2 API Endpoints

#### Playground Execution (`internal/prompt/handler/playground.go`)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `POST` | `/v1/playground/execute` | Execute a prompt against a model | 200 OK (streamed SSE or JSON) |
| `POST` | `/v1/playground/compare` | Execute a prompt against multiple models | 200 OK |

**Execute Request:**

```json
{
    "prompt_id": "uuid (optional — if provided, loads prompt template)",
    "body": "You are a helpful agent. Respond to: {{message}}",
    "system_prompt": "You are a helpful assistant.",
    "variables": {
        "message": "How do I reset my password?"
    },
    "model": "gpt-4o",
    "provider": "openai",
    "config": {
        "temperature": 0.7,
        "max_tokens": 1024,
        "top_p": 1.0
    },
    "stream": true
}
```

**Execute Response (non-streaming):**

```json
{
    "data": {
        "output": "To reset your password, follow these steps...",
        "model": "gpt-4o",
        "provider": "openai",
        "tokens_in": 45,
        "tokens_out": 128,
        "cost_cents": 12,
        "latency_ms": 1230,
        "finish_reason": "stop"
    }
}
```

**Execute Response (streaming):** Server-Sent Events (SSE):

```
data: {"type": "token", "content": "To"}
data: {"type": "token", "content": " reset"}
data: {"type": "token", "content": " your"}
...
data: {"type": "done", "tokens_in": 45, "tokens_out": 128, "cost_cents": 12, "latency_ms": 1230}
```

**Compare Request:**

```json
{
    "body": "Explain quantum computing in one paragraph.",
    "system_prompt": "",
    "variables": {},
    "models": [
        {"model": "gpt-4o", "provider": "openai"},
        {"model": "claude-sonnet-4-6", "provider": "anthropic"},
        {"model": "gemini-2.0-flash", "provider": "google"}
    ],
    "config": {
        "temperature": 0.7,
        "max_tokens": 512
    }
}
```

**Compare Response:**

```json
{
    "data": {
        "results": [
            {
                "model": "gpt-4o",
                "provider": "openai",
                "output": "...",
                "tokens_in": 15,
                "tokens_out": 89,
                "cost_cents": 8,
                "latency_ms": 980
            },
            {
                "model": "claude-sonnet-4-6",
                "provider": "anthropic",
                "output": "...",
                "tokens_in": 15,
                "tokens_out": 102,
                "cost_cents": 10,
                "latency_ms": 1150
            }
        ]
    }
}
```

### 4.3 Service Layer

**`internal/prompt/service/executor.go`** — Playground execution engine:

```go
// Executor sends prompts to LLM providers via the Route module's provider adapters.
// It reuses the existing provider adapter interface from internal/route/provider/.
// This means the Playground automatically supports all providers that Route supports.

type ExecuteRequest struct {
    Body         string                 `json:"body"`
    SystemPrompt string                 `json:"system_prompt"`
    Variables    map[string]interface{} `json:"variables"`
    Model        string                 `json:"model"`
    Provider     string                 `json:"provider"`
    Config       ExecuteConfig          `json:"config"`
    Stream       bool                   `json:"stream"`
}

type ExecuteResult struct {
    Output       string `json:"output"`
    Model        string `json:"model"`
    Provider     string `json:"provider"`
    TokensIn     int    `json:"tokens_in"`
    TokensOut    int    `json:"tokens_out"`
    CostCents    int64  `json:"cost_cents"`
    LatencyMs    int    `json:"latency_ms"`
    FinishReason string `json:"finish_reason"`
}

func (e *Executor) Execute(ctx context.Context, req ExecuteRequest) (*ExecuteResult, error)
func (e *Executor) ExecuteStream(ctx context.Context, req ExecuteRequest, w http.ResponseWriter) error
func (e *Executor) Compare(ctx context.Context, req CompareRequest) (*CompareResult, error)
```

The Executor uses the provider adapters already built in `internal/route/provider/`. It does NOT go through the gateway proxy — it calls providers directly using the org's configured API keys from the providers table.

### 4.4 Dashboard Pages

#### Standalone Playground (`web/app/(dashboard)/playground/page.tsx`)

Full-screen split-pane layout:

- **Left panel (50%):**
  - System prompt textarea (collapsible)
  - User prompt textarea (large, monospace, `{{variable}}` highlighting)
  - Variable input form (auto-detected from `{{...}}` patterns, dynamic fields)
  - "Load from Prompt Library" dropdown (searches prompts by slug/name)
- **Right panel (50%):**
  - Model selector dropdown (lists configured providers + their models)
  - Parameter controls: temperature slider (0-2), max tokens input, top_p slider
  - "Run" button (primary, large) with Cmd+Enter shortcut
  - Output viewer: streamed text with typing animation, monospace
  - Stats bar below output: tokens in/out, cost, latency
  - "Compare" toggle: switches to multi-model comparison view

#### Comparison View (within Playground)

- Up to 4 models side-by-side in columns
- Each column: model name header, output text, stats row
- "Run All" button executes all models in parallel
- Color-coded latency (green < 1s, amber < 3s, red > 3s)
- Cost comparison bar chart below

#### Prompt Detail Playground (`web/app/(dashboard)/prompts/[id]/playground/page.tsx`)

Same as standalone Playground but pre-loaded with the prompt's body, system prompt, model, config, and variables. "Save as New Version" button appears if the user modifies the prompt text.

### 4.5 Components

**`web/components/playground/playground-panel.tsx`** — Main split-pane container with resizable divider (drag to resize left/right panels).

**`web/components/playground/model-selector.tsx`** — Dropdown that fetches available providers from `/v1/gateway/providers` and lists their supported models. Groups by provider.

**`web/components/playground/parameter-controls.tsx`** — Horizontal row of controls:
- Temperature: slider with numeric input, default 0.7
- Max tokens: numeric input, default 1024
- Top P: slider, default 1.0

**`web/components/playground/output-viewer.tsx`** — Streaming output display:
- Monospace font (JetBrains Mono)
- Typing animation for streamed tokens
- Copy button (top-right corner)
- Token count badge
- Loading state: pulsing cursor

**`web/components/playground/comparison-view.tsx`** — Grid of 2-4 output columns:
- Framer Motion layout animation when adding/removing models
- Each column independently scrollable
- "Winner" badge on fastest/cheapest result

### 4.6 Route Registration

```go
// Playground
r.Route("/v1/playground", func(r chi.Router) {
    r.Post("/execute", playgroundHandler.Execute)
    r.Post("/compare", playgroundHandler.Compare)
})
```

---

## 5. Phase 11: Dataset Management for Evals

### 5.1 Why

The Test module runs evaluations, but where does the test data come from? Today, test cases are created manually one at a time. Dataset Management provides bulk data management: import CSV/JSON files of test inputs, capture production failures as dataset items, and link datasets to test suites. This is the bridge from OBSERVE (production failures) to IMPROVE (regression tests).

### 5.2 Data Models

#### Dataset

```go
type Dataset struct {
    ID          uuid.UUID       `json:"id" db:"id"`
    OrgID       uuid.UUID       `json:"org_id" db:"org_id"`
    Name        string          `json:"name" db:"name"`
    Description string          `json:"description" db:"description"`
    Schema      json.RawMessage `json:"schema" db:"schema"`     // column definitions
    ItemCount   int             `json:"item_count" db:"item_count"` // denormalized count
    Tags        []string        `json:"tags" db:"tags"`
    Source      string          `json:"source" db:"source"`      // manual, production, import
    CreatedAt   time.Time       `json:"created_at" db:"created_at"`
    UpdatedAt   time.Time       `json:"updated_at" db:"updated_at"`
}
```

#### DatasetItem

```go
type DatasetItem struct {
    ID        uuid.UUID       `json:"id" db:"id"`
    DatasetID uuid.UUID       `json:"dataset_id" db:"dataset_id"`
    OrgID     uuid.UUID       `json:"org_id" db:"org_id"`
    Data      json.RawMessage `json:"data" db:"data"`           // the row data (matches schema)
    Metadata  json.RawMessage `json:"metadata" db:"metadata"`   // source info, session_id, etc.
    CreatedAt time.Time       `json:"created_at" db:"created_at"`
}
```

#### DatasetSuiteLink (join table)

```go
type DatasetSuiteLink struct {
    ID        uuid.UUID `json:"id" db:"id"`
    DatasetID uuid.UUID `json:"dataset_id" db:"dataset_id"`
    SuiteID   uuid.UUID `json:"suite_id" db:"suite_id"`
    OrgID     uuid.UUID `json:"org_id" db:"org_id"`
    CreatedAt time.Time `json:"created_at" db:"created_at"`
}
```

### 5.3 Database Schema

**File: `migrations/postgres/008_datasets.up.sql`**

```sql
-- =============================================
-- AgentStack Dataset Management — Database Schema
-- =============================================

CREATE TABLE datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    schema JSONB DEFAULT '{}',
    item_count INTEGER NOT NULL DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'manual',   -- manual, production, import
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, name)
);

CREATE INDEX idx_datasets_org ON datasets(org_id);
CREATE INDEX idx_datasets_tags ON datasets USING GIN(tags);

CREATE TABLE dataset_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dataset_items_dataset ON dataset_items(dataset_id);
CREATE INDEX idx_dataset_items_org ON dataset_items(org_id);

-- Link datasets to test suites (many-to-many)
CREATE TABLE dataset_suite_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    suite_id UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(dataset_id, suite_id)
);

CREATE INDEX idx_dataset_suite_links_dataset ON dataset_suite_links(dataset_id);
CREATE INDEX idx_dataset_suite_links_suite ON dataset_suite_links(suite_id);

-- Schema format in `schema` column:
-- {
--   "columns": [
--     {"name": "input", "type": "string", "description": "User input text"},
--     {"name": "expected_output", "type": "string", "description": "Expected agent response"},
--     {"name": "context", "type": "string", "description": "Optional context for RAG"},
--     {"name": "category", "type": "string", "description": "Test category label"}
--   ]
-- }

-- Metadata format in dataset_items.metadata:
-- {
--   "source_session_id": "uuid",      -- if captured from production
--   "source_span_id": "uuid",
--   "import_file": "customers.csv",   -- if imported from file
--   "import_row": 42
-- }
```

**File: `migrations/postgres/008_datasets.down.sql`**

```sql
DROP TABLE IF EXISTS dataset_suite_links;
DROP TABLE IF EXISTS dataset_items;
DROP TABLE IF EXISTS datasets;
```

### 5.4 API Endpoints

#### Dataset CRUD (`internal/dataset/handler/datasets.go`)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `POST` | `/v1/datasets` | Create a dataset | 201 Created |
| `GET` | `/v1/datasets` | List datasets for org | 200 OK (paginated) |
| `GET` | `/v1/datasets/{id}` | Get dataset with schema and item count | 200 OK |
| `PATCH` | `/v1/datasets/{id}` | Update dataset metadata | 200 OK |
| `DELETE` | `/v1/datasets/{id}` | Delete dataset and all items | 204 No Content |
| `POST` | `/v1/datasets/{id}/link/{suite_id}` | Link dataset to test suite | 201 Created |
| `DELETE` | `/v1/datasets/{id}/link/{suite_id}` | Unlink dataset from test suite | 204 No Content |

#### Dataset Item Management (`internal/dataset/handler/items.go`)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `POST` | `/v1/datasets/{id}/items` | Add a single item | 201 Created |
| `POST` | `/v1/datasets/{id}/items/batch` | Add items in batch (up to 1000) | 201 Created |
| `GET` | `/v1/datasets/{id}/items` | List items (paginated) | 200 OK |
| `GET` | `/v1/datasets/{id}/items/{item_id}` | Get a single item | 200 OK |
| `DELETE` | `/v1/datasets/{id}/items/{item_id}` | Delete a single item | 204 No Content |
| `POST` | `/v1/datasets/{id}/import` | Import from CSV/JSON/JSONL file upload | 202 Accepted |
| `GET` | `/v1/datasets/{id}/export` | Export to JSON | 200 OK |
| `POST` | `/v1/datasets/from-session/{session_id}` | Create dataset item from production session | 201 Created |

**Import Request (multipart/form-data):**

```
POST /v1/datasets/{id}/import
Content-Type: multipart/form-data

file: (CSV, JSON, or JSONL file, max 10MB)
format: "csv" | "json" | "jsonl"
column_mapping: {"input_col": "input", "output_col": "expected_output"} (optional, for CSV)
```

**From-Session Request:**

```json
{
    "session_id": "uuid",
    "dataset_id": "uuid",
    "include_input": true,
    "include_output": true,
    "include_context": true,
    "label": "production_failure_2026_03_20"
}
```

This endpoint reads the session from Trace, extracts input/output/context from spans, and creates a DatasetItem. This is the critical bridge from OBSERVE to IMPROVE.

### 5.5 Service Layer

**`internal/dataset/service/dataset.go`** — Dataset CRUD with item_count denormalization (update count on item add/delete/import).

**`internal/dataset/service/importer.go`** — File import engine:

```go
// Importer handles CSV, JSON, and JSONL file imports.
// Max file size: 10MB.
// Max items per import: 10,000.
// CSV: first row is headers, mapped via column_mapping or auto-detected.
// JSON: expects array of objects.
// JSONL: one JSON object per line.

func (i *Importer) ImportCSV(ctx context.Context, datasetID uuid.UUID, reader io.Reader, mapping map[string]string) (int, error)
func (i *Importer) ImportJSON(ctx context.Context, datasetID uuid.UUID, reader io.Reader) (int, error)
func (i *Importer) ImportJSONL(ctx context.Context, datasetID uuid.UUID, reader io.Reader) (int, error)
```

**`internal/dataset/service/exporter.go`** — Export dataset items to JSON format.

### 5.6 Integration Points

| Source | Target | Integration |
|--------|--------|-------------|
| Dataset | Test | When a test suite has linked datasets, `POST /v1/test/runs` can specify `dataset_id` to run the suite against all items in the dataset. Each item becomes a test case input. |
| Trace | Dataset | `POST /v1/datasets/from-session/{session_id}` captures production session data as a dataset item. This enables one-click "add to regression test" from the session detail page. |
| Dataset | Playground | Dataset items can be loaded as variable inputs in the Playground for manual testing. |

### 5.7 Modification to Existing Test Module

Add to `internal/test/service/runner.go`:

```go
// When creating a test run, if dataset_id is provided:
// 1. Fetch all items from the dataset
// 2. For each item, create a temporary test case using the item's data as input
// 3. Run evaluators against each temporary test case
// 4. Aggregate results normally

// Modified CreateTestRun request:
type CreateTestRunRequest struct {
    SuiteID   uuid.UUID `json:"suite_id"`
    DatasetID uuid.UUID `json:"dataset_id,omitempty"` // NEW: run against dataset items
    Name      string    `json:"name,omitempty"`
}
```

### 5.8 Dashboard Pages

#### Dataset Library (`web/app/(dashboard)/datasets/page.tsx`)

- **Header:** "Datasets" title + "Create Dataset" button + "Import" button
- **Grid layout:** Dataset cards showing name, item count, source badge (manual/production/import), tags, last updated
- **Empty state:** Icon (Database) + "No datasets yet" + "Create a dataset to manage your eval data" + CTA
- **Loading state:** 6 skeleton cards

#### Dataset Detail (`web/app/(dashboard)/datasets/[id]/page.tsx`)

- **Header:** Dataset name, description, item count, source
- **Tabs:** Items | Schema | Linked Suites
- **Items tab:** Paginated table of dataset items
  - Columns auto-generated from schema
  - Row expansion to see full JSON data
  - "Add Item" button opens inline form
  - "Import" button opens import dialog
  - Bulk select + delete
- **Schema tab:** Visual schema editor (column name, type, description)
- **Linked Suites tab:** List of linked test suites with "Link Suite" button and "Run Tests" button

#### Import Dialog (`web/components/dataset/import-dialog.tsx`)

- Drag-and-drop file upload zone
- Format auto-detection (CSV/JSON/JSONL)
- Column mapping UI for CSV (dropdown per column)
- Preview of first 5 rows
- "Import" button with progress indicator

### 5.9 Route Registration

```go
// Datasets
r.Route("/v1/datasets", func(r chi.Router) {
    r.Post("/", datasetHandler.Create)
    r.Get("/", datasetHandler.List)
    r.Get("/{id}", datasetHandler.Get)
    r.Patch("/{id}", datasetHandler.Update)
    r.Delete("/{id}", datasetHandler.Delete)
    r.Post("/{id}/link/{suiteID}", datasetHandler.LinkSuite)
    r.Delete("/{id}/link/{suiteID}", datasetHandler.UnlinkSuite)
    r.Post("/{id}/items", itemHandler.Create)
    r.Post("/{id}/items/batch", itemHandler.CreateBatch)
    r.Get("/{id}/items", itemHandler.List)
    r.Get("/{id}/items/{itemID}", itemHandler.Get)
    r.Delete("/{id}/items/{itemID}", itemHandler.Delete)
    r.Post("/{id}/import", itemHandler.Import)
    r.Get("/{id}/export", itemHandler.Export)
    r.Post("/from-session/{sessionID}", datasetHandler.FromSession)
})
```

### 5.10 Seed Data: RAG Evaluators

As noted in the analysis, RAG evaluation metrics belong as evaluator configs, not as a separate feature. Add these to the existing evaluator seed data in `seed/evaluators.json`:

```json
[
    {
        "name": "rag_faithfulness",
        "display_name": "RAG Faithfulness",
        "type": "llm_judge",
        "description": "Measures whether the response is faithful to the provided context. Detects hallucinated facts not present in the source material.",
        "config": {
            "prompt": "Given the following context and response, evaluate whether the response is faithful to the context. A faithful response only contains information that can be directly inferred from the context.\n\nContext: {{context}}\nResponse: {{output}}\n\nScore from 0.0 (completely unfaithful) to 1.0 (perfectly faithful). Return JSON: {\"score\": <float>, \"reason\": \"<explanation>\"}",
            "requires_context": true
        },
        "category": "rag"
    },
    {
        "name": "rag_context_relevance",
        "display_name": "RAG Context Relevance",
        "type": "llm_judge",
        "description": "Measures whether the retrieved context is relevant to the input question.",
        "config": {
            "prompt": "Given the following question and retrieved context, evaluate whether the context is relevant to answering the question.\n\nQuestion: {{input}}\nContext: {{context}}\n\nScore from 0.0 (completely irrelevant) to 1.0 (perfectly relevant). Return JSON: {\"score\": <float>, \"reason\": \"<explanation>\"}",
            "requires_context": true
        },
        "category": "rag"
    },
    {
        "name": "rag_answer_relevance",
        "display_name": "RAG Answer Relevance",
        "type": "llm_judge",
        "description": "Measures whether the response actually answers the input question.",
        "config": {
            "prompt": "Given the following question and response, evaluate whether the response adequately answers the question.\n\nQuestion: {{input}}\nResponse: {{output}}\n\nScore from 0.0 (does not answer) to 1.0 (fully answers). Return JSON: {\"score\": <float>, \"reason\": \"<explanation>\"}",
            "requires_context": false
        },
        "category": "rag"
    }
]
```

---

## 6. Phase 12: OpenTelemetry Native Support

### 6.1 Why

Most production teams already run OpenTelemetry collectors. If AgentStack can only ingest its proprietary span format, teams must instrument twice. OTel support means: (1) teams with existing OTel instrumentation can send spans to AgentStack with zero code changes, and (2) AgentStack's own SDKs can export to OTel-compatible backends for teams that want dual-write. This removes the biggest adoption barrier for teams with existing observability stacks.

### 6.2 Architecture

```
┌─────────────────────┐     ┌──────────────────────────────────┐
│ OTel-instrumented    │     │ AgentStack API Server             │
│ application          │     │                                    │
│                      │     │  /v1/ingest/* (existing)           │
│  OTel SDK            │────▶│  /v1/otlp/v1/traces (NEW — OTLP)  │
│  (traces/spans)      │     │                                    │
└─────────────────────┘     │  OTel Translator Service           │
                             │  OTel Span → AgentStack Span       │
┌─────────────────────┐     │                                    │
│ OTel Collector       │────▶│  Same ClickHouse destination       │
│ (OTLP exporter)      │     │  Same NATS async pipeline          │
└─────────────────────┘     └──────────────────────────────────┘
```

AgentStack accepts OTLP/HTTP traces at `/v1/otlp/v1/traces`. It translates OTel spans into AgentStack's native span format and feeds them into the same NATS → ClickHouse pipeline. No separate storage or query path — OTel spans appear in the same sessions, same dashboard, same analytics.

### 6.3 API Endpoints

#### OTLP Receiver (`internal/otel/handler/otlp.go`)

| Method | Path | Description | Content-Type | Response |
|--------|------|-------------|-------------|----------|
| `POST` | `/v1/otlp/v1/traces` | OTLP HTTP trace export | `application/x-protobuf` or `application/json` | 200 OK |

This endpoint implements the [OTLP/HTTP specification](https://opentelemetry.io/docs/specs/otlp/#otlphttp). It accepts both protobuf and JSON encoding.

**OTLP JSON Request (simplified):**

```json
{
    "resourceSpans": [
        {
            "resource": {
                "attributes": [
                    {"key": "service.name", "value": {"stringValue": "my-agent"}},
                    {"key": "agentstack.agent.id", "value": {"stringValue": "uuid"}}
                ]
            },
            "scopeSpans": [
                {
                    "scope": {
                        "name": "agentstack-sdk",
                        "version": "1.0.0"
                    },
                    "spans": [
                        {
                            "traceId": "hex-trace-id",
                            "spanId": "hex-span-id",
                            "parentSpanId": "hex-parent-id",
                            "name": "llm.call",
                            "kind": 3,
                            "startTimeUnixNano": "1679000000000000000",
                            "endTimeUnixNano": "1679000001230000000",
                            "attributes": [
                                {"key": "gen_ai.system", "value": {"stringValue": "openai"}},
                                {"key": "gen_ai.request.model", "value": {"stringValue": "gpt-4o"}},
                                {"key": "gen_ai.usage.input_tokens", "value": {"intValue": "150"}},
                                {"key": "gen_ai.usage.output_tokens", "value": {"intValue": "89"}},
                                {"key": "gen_ai.response.finish_reasons", "value": {"stringValue": "stop"}}
                            ],
                            "status": {"code": 1}
                        }
                    ]
                }
            ]
        }
    ]
}
```

**OTLP Response:**

```json
{
    "partialSuccess": {
        "rejectedSpans": 0,
        "errorMessage": ""
    }
}
```

### 6.4 Service Layer — OTel Translator

**`internal/otel/service/translator.go`** — Converts OTel spans to AgentStack spans:

```go
// Translator converts OpenTelemetry spans to AgentStack's native span format.
// It maps OTel semantic conventions to AgentStack fields.
//
// Key mappings:
//   OTel traceId       → AgentStack session_id (one trace = one session)
//   OTel spanId        → AgentStack span_id
//   OTel parentSpanId  → AgentStack parent_span_id
//   OTel name          → AgentStack span_name
//   OTel startTime     → AgentStack started_at
//   OTel endTime       → AgentStack ended_at
//   OTel status.code   → AgentStack status (OK=completed, ERROR=failed)
//
// GenAI semantic convention mappings (https://opentelemetry.io/docs/specs/semconv/gen-ai/):
//   gen_ai.system              → AgentStack provider
//   gen_ai.request.model       → AgentStack model
//   gen_ai.usage.input_tokens  → AgentStack tokens_in
//   gen_ai.usage.output_tokens → AgentStack tokens_out
//   gen_ai.response.finish_reasons → AgentStack finish_reason
//
// Resource attribute mappings:
//   service.name               → AgentStack agent_name
//   agentstack.agent.id        → AgentStack agent_id
//   agentstack.org.id          → AgentStack org_id (alternative to API key auth)
//
// All unmapped attributes are stored in AgentStack span's metadata JSONB field.

type Translator struct{}

func (t *Translator) TranslateTraceRequest(req *otlp.ExportTraceServiceRequest) ([]IngestSpan, error)
```

**`internal/otel/service/attributes.go`** — Semantic convention constants and mapping helpers:

```go
// GenAI Semantic Conventions
const (
    AttrGenAISystem          = "gen_ai.system"
    AttrGenAIRequestModel    = "gen_ai.request.model"
    AttrGenAIInputTokens     = "gen_ai.usage.input_tokens"
    AttrGenAIOutputTokens    = "gen_ai.usage.output_tokens"
    AttrGenAIFinishReasons   = "gen_ai.response.finish_reasons"
    AttrGenAIPrompt          = "gen_ai.prompt"
    AttrGenAICompletion      = "gen_ai.completion"
    AttrGenAITemperature     = "gen_ai.request.temperature"
    AttrGenAIMaxTokens       = "gen_ai.request.max_tokens"
)

// AgentStack custom attributes (used in OTel spans to pass AgentStack-specific data)
const (
    AttrAgentStackOrgID      = "agentstack.org.id"
    AttrAgentStackAgentID    = "agentstack.agent.id"
    AttrAgentStackSessionID  = "agentstack.session.id"
    AttrAgentStackSpanType   = "agentstack.span.type"      // llm_call, tool_call, agent_step, etc.
    AttrAgentStackPromptID   = "agentstack.prompt.id"
    AttrAgentStackPromptVer  = "agentstack.prompt.version"
)

// SpanType detection from OTel span attributes
func DetectSpanType(attrs map[string]interface{}) string {
    // If gen_ai.system is present → "llm_call"
    // If rpc.system == "tool" → "tool_call"
    // If agentstack.span.type is set → use that value
    // Default → "custom"
}
```

### 6.5 Dependencies

Add to `go.mod`:

```
go.opentelemetry.io/proto/otlp v1.3.1
google.golang.org/protobuf v1.34.2
```

These provide the compiled OTLP protobuf types. No need for a full OTel SDK dependency — we only need the proto types for decoding.

### 6.6 Authentication

OTel spans are authenticated the same way as native ingestion: via `Authorization: Bearer <api_key>` header. The OTLP spec supports custom headers, and all OTel SDKs/collectors allow configuring authorization headers on exporters.

**OTel Collector config example:**

```yaml
exporters:
  otlphttp:
    endpoint: https://api.agentstack.dev/v1/otlp
    headers:
      Authorization: "Bearer as_sk_prod_abc123"
```

**OTel SDK (Python) config example:**

```python
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

exporter = OTLPSpanExporter(
    endpoint="https://api.agentstack.dev/v1/otlp/v1/traces",
    headers={"Authorization": "Bearer as_sk_prod_abc123"}
)
```

### 6.7 Route Registration

```go
// OpenTelemetry OTLP receiver
r.Route("/v1/otlp", func(r chi.Router) {
    r.Post("/v1/traces", otelHandler.ReceiveTraces)
})
```

### 6.8 SDK Enhancement

Add OTel export support to AgentStack SDKs so they can dual-write to both AgentStack and any OTel-compatible backend:

**Python SDK (`sdk/python/agentstack/otel.py`):**

```python
# Optional OTel integration — only active if opentelemetry-sdk is installed
# Usage:
#   agentstack.init(
#       api_key="as_sk_...",
#       otel_export=True,  # also export spans as OTel spans
#       otel_endpoint="http://localhost:4318/v1/traces"  # optional: OTel collector
#   )
#
# This wraps AgentStack's span creation to also create OTel spans,
# so teams can see AgentStack data in both AgentStack dashboard AND
# their existing OTel backend (Jaeger, Datadog, Honeycomb, etc.)
```

**TypeScript SDK (`sdk/typescript/src/otel.ts`):**

```typescript
// Same dual-export pattern for TypeScript
```

### 6.9 No New Dashboard Pages

OTel spans flow into the existing Trace pipeline. They appear in:
- Sessions list (same page, same table)
- Session detail (same timeline)
- Analytics (same aggregations)

No new dashboard pages are needed. The only UI change is adding an "OTel" badge to sessions/spans that were ingested via the OTLP endpoint (detected by presence of OTel-specific attributes in metadata). This badge appears in:
- Session list: small "OTel" badge next to the session name
- Span detail: "Source: OpenTelemetry" label

### 6.10 Integration Points

| Source | Target | Integration |
|--------|--------|-------------|
| OTel | Trace | OTel spans are translated and stored as native AgentStack spans. Same ClickHouse tables, same NATS pipeline. |
| OTel | Shield | If an OTel span has error status, Shield healing rules still apply (if the org has Shield enabled). |
| OTel | Cost | If OTel spans include token counts (gen_ai.usage.*), cost events are auto-generated. |
| OTel | Prompt | If OTel spans include `agentstack.prompt.id` attribute, the span is linked to the prompt version. |

---

## 7. Phase 13: Webhook / Notification Integrations

### 7.1 Why

AgentStack already has alert rules in the Trace module (e.g., "alert when failure rate > 10%"). But alerts currently have no delivery mechanism — they fire into the void. Webhooks make alerts actionable: Shield auto-heals a failure and the team gets a Slack message, Guard blocks a PII leak and PagerDuty creates an incident, a budget threshold is crossed and the finance channel gets notified. Without notifications, the OBSERVE and HEAL stages are passive — teams only discover issues when they open the dashboard.

### 7.2 Data Models

#### WebhookEndpoint

```go
type WebhookEndpoint struct {
    ID          uuid.UUID       `json:"id" db:"id"`
    OrgID       uuid.UUID       `json:"org_id" db:"org_id"`
    Name        string          `json:"name" db:"name"`
    Type        string          `json:"type" db:"type"`           // generic, slack, pagerduty
    URL         string          `json:"url" db:"url"`             // webhook URL (encrypted at rest)
    Secret      string          `json:"secret" db:"secret"`       // HMAC signing secret (encrypted)
    Events      []string        `json:"events" db:"events"`       // which events to send
    Headers     json.RawMessage `json:"headers" db:"headers"`     // custom HTTP headers
    IsActive    bool            `json:"is_active" db:"is_active"`
    CreatedAt   time.Time       `json:"created_at" db:"created_at"`
    UpdatedAt   time.Time       `json:"updated_at" db:"updated_at"`
}
```

**Event types** (`events` field):

```
alert.fired              — Trace alert rule triggered
alert.resolved           — Trace alert rule resolved
shield.healing           — Shield auto-healed a failure
shield.circuit_break     — Shield circuit breaker activated
guard.blocked            — Guard blocked a request
guard.flagged            — Guard flagged (warning, not block)
cost.budget_warning      — Budget at 80% utilization
cost.budget_exceeded     — Budget exceeded
test.run_completed       — Test run finished
test.run_failed          — Test run failed quality gate
session.failed           — A session ended in failure
```

#### WebhookDelivery

```go
type WebhookDelivery struct {
    ID           uuid.UUID       `json:"id" db:"id"`
    EndpointID   uuid.UUID       `json:"endpoint_id" db:"endpoint_id"`
    OrgID        uuid.UUID       `json:"org_id" db:"org_id"`
    Event        string          `json:"event" db:"event"`
    Payload      json.RawMessage `json:"payload" db:"payload"`
    StatusCode   int             `json:"status_code" db:"status_code"`
    ResponseBody string          `json:"response_body" db:"response_body"`
    Attempts     int             `json:"attempts" db:"attempts"`
    Status       string          `json:"status" db:"status"`         // pending, delivered, failed
    NextRetryAt  *time.Time      `json:"next_retry_at" db:"next_retry_at"`
    CreatedAt    time.Time       `json:"created_at" db:"created_at"`
    DeliveredAt  *time.Time      `json:"delivered_at" db:"delivered_at"`
}
```

### 7.3 Database Schema

**File: `migrations/postgres/009_webhooks.up.sql`**

```sql
-- =============================================
-- AgentStack Webhook Integrations — Database Schema
-- =============================================

CREATE TABLE webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'generic',     -- generic, slack, pagerduty
    url TEXT NOT NULL,                         -- encrypted at rest
    secret TEXT DEFAULT '',                    -- HMAC-SHA256 signing secret (encrypted)
    events TEXT[] NOT NULL DEFAULT '{}',       -- which events trigger this webhook
    headers JSONB DEFAULT '{}',               -- custom HTTP headers
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_endpoints_org ON webhook_endpoints(org_id);
CREATE INDEX idx_webhook_endpoints_active ON webhook_endpoints(org_id, is_active) WHERE is_active = true;
CREATE INDEX idx_webhook_endpoints_events ON webhook_endpoints USING GIN(events);

CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    event TEXT NOT NULL,
    payload JSONB NOT NULL,
    status_code INTEGER DEFAULT 0,
    response_body TEXT DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending, delivered, failed
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status) WHERE status = 'pending';
CREATE INDEX idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'pending' AND next_retry_at IS NOT NULL;
CREATE INDEX idx_webhook_deliveries_org ON webhook_deliveries(org_id, created_at DESC);

-- Delivery retention: delete deliveries older than 30 days (handled by worker)
```

**File: `migrations/postgres/009_webhooks.down.sql`**

```sql
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhook_endpoints;
```

### 7.4 API Endpoints

#### Webhook CRUD (`internal/webhook/handler/webhooks.go`)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `POST` | `/v1/webhooks` | Create a webhook endpoint | 201 Created |
| `GET` | `/v1/webhooks` | List webhook endpoints for org | 200 OK |
| `GET` | `/v1/webhooks/{id}` | Get webhook endpoint | 200 OK |
| `PATCH` | `/v1/webhooks/{id}` | Update webhook endpoint | 200 OK |
| `DELETE` | `/v1/webhooks/{id}` | Delete webhook endpoint | 204 No Content |
| `POST` | `/v1/webhooks/{id}/test` | Send a test webhook delivery | 200 OK |

**Create Webhook Request:**

```json
{
    "name": "Production Alerts → Slack",
    "type": "slack",
    "url": "https://hooks.slack.com/services/T00/B00/xxxx",
    "events": [
        "alert.fired",
        "shield.healing",
        "guard.blocked",
        "cost.budget_warning"
    ]
}
```

**Create Webhook (PagerDuty) Request:**

```json
{
    "name": "Critical Alerts → PagerDuty",
    "type": "pagerduty",
    "url": "https://events.pagerduty.com/v2/enqueue",
    "headers": {
        "X-Routing-Key": "pd-routing-key-here"
    },
    "events": [
        "shield.circuit_break",
        "cost.budget_exceeded",
        "test.run_failed"
    ]
}
```

**Create Webhook (Generic) Request:**

```json
{
    "name": "Custom Integration",
    "type": "generic",
    "url": "https://my-api.example.com/webhooks/agentstack",
    "secret": "whsec_abc123",
    "headers": {
        "X-Custom-Header": "value"
    },
    "events": ["alert.fired", "session.failed"]
}
```

#### Delivery Log (`internal/webhook/handler/deliveries.go`)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/v1/webhooks/{id}/deliveries` | List deliveries for an endpoint | 200 OK (paginated) |
| `POST` | `/v1/webhooks/{id}/deliveries/{delivery_id}/retry` | Retry a failed delivery | 202 Accepted |

### 7.5 Service Layer

**`internal/webhook/service/dispatcher.go`** — Core dispatch engine:

```go
// Dispatcher receives webhook events from other modules and delivers them.
// Architecture:
//   1. Module fires event → publishes to NATS subject "webhooks.{event_type}"
//   2. webhook_sender worker consumes from NATS
//   3. Worker queries all active endpoints subscribed to that event type
//   4. Worker creates WebhookDelivery records and sends HTTP requests
//   5. On failure: exponential backoff retry (1min, 5min, 30min, 2hr, 12hr — max 5 attempts)

type Dispatcher struct {
    store    *store.WebhookStore
    nats     *nats.Conn
    httpClient *http.Client
}

// Dispatch publishes a webhook event to NATS for async delivery.
// Called by other modules (Trace alerts, Shield healing, Guard blocks, etc.)
func (d *Dispatcher) Dispatch(ctx context.Context, orgID uuid.UUID, event string, payload interface{}) error

// Deliver sends a webhook to a single endpoint. Called by the worker.
func (d *Dispatcher) Deliver(ctx context.Context, endpoint WebhookEndpoint, delivery WebhookDelivery) error
```

**`internal/webhook/service/slack.go`** — Slack message formatting:

```go
// SlackFormatter converts webhook payloads into Slack Block Kit messages.
// Each event type has a tailored Slack message format.

func FormatSlackMessage(event string, payload map[string]interface{}) SlackMessage

// Example Slack message for "shield.healing":
// {
//   "blocks": [
//     {
//       "type": "header",
//       "text": {"type": "plain_text", "text": "🔄 Shield Auto-Healed a Failure"}
//     },
//     {
//       "type": "section",
//       "fields": [
//         {"type": "mrkdwn", "text": "*Agent:* customer-support-bot"},
//         {"type": "mrkdwn", "text": "*Session:* abc123"},
//         {"type": "mrkdwn", "text": "*Healer:* loop_breaker"},
//         {"type": "mrkdwn", "text": "*Action:* Broke infinite loop after 3 iterations"}
//       ]
//     },
//     {
//       "type": "actions",
//       "elements": [
//         {
//           "type": "button",
//           "text": {"type": "plain_text", "text": "View Session"},
//           "url": "https://app.agentstack.dev/sessions/abc123"
//         }
//       ]
//     }
//   ]
// }
```

**`internal/webhook/service/pagerduty.go`** — PagerDuty Events API v2 formatting:

```go
// PagerDutyFormatter converts webhook payloads into PagerDuty Events API v2 format.

func FormatPagerDutyEvent(event string, payload map[string]interface{}, routingKey string) PagerDutyEvent

// Example PagerDuty event for "cost.budget_exceeded":
// {
//   "routing_key": "pd-routing-key",
//   "event_action": "trigger",
//   "dedup_key": "budget-exceeded-budget-id",
//   "payload": {
//     "summary": "Budget 'Production Monthly' exceeded: $523.40 / $500.00",
//     "severity": "critical",
//     "source": "agentstack",
//     "component": "cost",
//     "custom_details": {
//       "budget_name": "Production Monthly",
//       "current_spend_cents": 52340,
//       "limit_cents": 50000,
//       "utilization_pct": 104.68
//     }
//   }
// }
```

### 7.6 Generic Webhook Payload Format

For `type: "generic"` webhooks, the payload is a standard JSON envelope:

```json
{
    "id": "delivery-uuid",
    "event": "alert.fired",
    "timestamp": "2026-03-20T15:04:05Z",
    "org_id": "org-uuid",
    "data": {
        "alert_rule_id": "uuid",
        "alert_rule_name": "High failure rate",
        "metric": "failure_rate",
        "threshold": 0.10,
        "current_value": 0.15,
        "agent_name": "customer-support-bot",
        "window_minutes": 15
    }
}
```

Generic webhooks include an `X-AgentStack-Signature` header: HMAC-SHA256 of the payload body using the endpoint's `secret`. Recipients can verify authenticity:

```
X-AgentStack-Signature: sha256=<hex-encoded-hmac>
X-AgentStack-Event: alert.fired
X-AgentStack-Delivery-ID: <delivery-uuid>
```

### 7.7 Worker — Webhook Sender

**`internal/worker/webhook_sender.go`:**

```go
// WebhookSender is a NATS consumer that delivers webhooks.
//
// NATS subjects:
//   webhooks.alert.fired
//   webhooks.alert.resolved
//   webhooks.shield.healing
//   webhooks.shield.circuit_break
//   webhooks.guard.blocked
//   webhooks.guard.flagged
//   webhooks.cost.budget_warning
//   webhooks.cost.budget_exceeded
//   webhooks.test.run_completed
//   webhooks.test.run_failed
//   webhooks.session.failed
//
// Consumer group: "webhook-sender" (ensures each event processed once)
//
// Retry policy:
//   Attempt 1: immediate
//   Attempt 2: after 1 minute
//   Attempt 3: after 5 minutes
//   Attempt 4: after 30 minutes
//   Attempt 5: after 2 hours
//   After 5 failures: mark as "failed", stop retrying
//
// Delivery timeout: 10 seconds per attempt
// A delivery is "successful" if the response status code is 2xx.
```

### 7.8 Integration Points — Event Sources

Each existing module publishes webhook events. These are the specific places in existing code that need modification:

| Module | File to Modify | Event | Trigger |
|--------|---------------|-------|---------|
| Trace | `internal/worker/alert_evaluator.go` | `alert.fired`, `alert.resolved` | When an alert rule condition is met/cleared |
| Shield | `internal/shield/service/healing.go` | `shield.healing` | When a healing intervention succeeds |
| Shield | `internal/shield/service/healing.go` | `shield.circuit_break` | When a circuit breaker activates |
| Guard | `internal/guard/service/engine.go` | `guard.blocked` | When a guard blocks a request |
| Guard | `internal/guard/service/engine.go` | `guard.flagged` | When a guard flags (warn level) |
| Cost | `internal/worker/budget_checker.go` | `cost.budget_warning`, `cost.budget_exceeded` | When budget utilization crosses 80% or 100% |
| Test | `internal/worker/test_executor.go` | `test.run_completed`, `test.run_failed` | When a test run finishes |
| Trace | `internal/trace/service/ingest.go` | `session.failed` | When a session ends with failed status |

Each modification is minimal: after the existing action, call `dispatcher.Dispatch(ctx, orgID, event, payload)`. The dispatcher publishes to NATS asynchronously — it never blocks the original operation.

### 7.9 Dashboard Pages

#### Webhook Settings (`web/app/(dashboard)/settings/webhooks/page.tsx`)

Located in Settings (not a top-level nav item):

- **Header:** "Webhooks" title + "Add Webhook" button
- **Webhook list:** Cards showing name, type badge (Slack/PagerDuty/Generic), URL (masked), subscribed events as badges, active/inactive toggle
- **Empty state:** Icon (Bell) + "No webhooks configured" + "Add a webhook to get notified when events occur" + CTA
- **Loading state:** 3 skeleton cards

#### Add/Edit Webhook Dialog (`web/components/webhook/webhook-form.tsx`)

- **Type selector:** Three cards to pick: Slack, PagerDuty, Generic
- **URL input:** For Slack, helper text "Paste your Slack Incoming Webhook URL"
- **Event checkboxes:** Grouped by module (Trace, Shield, Guard, Cost, Test)
- **Secret input:** Only shown for Generic type, with "Generate" button
- **Test button:** Sends a test delivery and shows result (success/fail + response)

#### Delivery Log (within webhook detail)

- Click a webhook card to expand delivery log
- Table: event, status (delivered/failed/pending), timestamp, attempts, status code
- "Retry" button on failed deliveries
- Auto-refresh every 30 seconds when viewing

### 7.10 Route Registration

```go
// Webhooks
r.Route("/v1/webhooks", func(r chi.Router) {
    r.Post("/", webhookHandler.Create)
    r.Get("/", webhookHandler.List)
    r.Get("/{id}", webhookHandler.Get)
    r.Patch("/{id}", webhookHandler.Update)
    r.Delete("/{id}", webhookHandler.Delete)
    r.Post("/{id}/test", webhookHandler.Test)
    r.Get("/{id}/deliveries", deliveryHandler.List)
    r.Post("/{id}/deliveries/{deliveryID}/retry", deliveryHandler.Retry)
})
```

---

## 8. Sidebar Navigation Update

Add new items to the dashboard sidebar in `web/components/sidebar.tsx`:

```typescript
// Updated navigation structure:
const navigation = [
    { name: "Overview", href: "/overview", icon: LayoutDashboard },
    { name: "Sessions", href: "/sessions", icon: Activity },
    { name: "Healing", href: "/healing", icon: Heart },
    { name: "Agents", href: "/agents", icon: Bot },

    // --- separator ---
    { name: "Prompts", href: "/prompts", icon: FileText },           // NEW
    { name: "Playground", href: "/playground", icon: Play },          // NEW
    { name: "Datasets", href: "/datasets", icon: Database },          // NEW

    // --- separator ---
    { name: "Test", href: "/test", icon: FlaskConical },
    { name: "Guard", href: "/guard", icon: ShieldCheck },
    { name: "Route", href: "/route", icon: GitBranch },
    { name: "Cost", href: "/cost", icon: DollarSign },

    // --- separator ---
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Patterns", href: "/patterns", icon: Fingerprint },
    { name: "Alerts", href: "/alerts", icon: Bell },

    // --- separator ---
    { name: "Settings", href: "/settings", icon: Settings },
    //   (Webhooks is a sub-page under Settings)
];
```

The DEVELOP group (Prompts, Playground, Datasets) sits between the OBSERVE group (Sessions, Healing, Agents) and the TOOLS group (Test, Guard, Route, Cost). This mirrors the loop: observe problems → develop improvements → run tools to validate.

---

## 9. Environment Variables — New

Add to `.env.example`:

```bash
# Webhooks
WEBHOOK_DELIVERY_TIMEOUT_SECONDS=10
WEBHOOK_MAX_RETRIES=5
WEBHOOK_RETRY_BACKOFF_MINUTES=1,5,30,120,720

# OTel
OTEL_INGEST_ENABLED=true    # Enable/disable OTLP endpoint

# Playground
PLAYGROUND_MAX_TOKENS=4096   # Max tokens allowed in playground execution
PLAYGROUND_RATE_LIMIT_RPM=60 # Playground requests per minute per org
```

---

## 10. Critical Rules for V2

All existing V1 critical rules (section 12 of CLAUDE.md) still apply. Additional rules for V2:

1. **Prompt slugs are immutable after creation.** Slug is the stable identifier SDKs use. Changing it would break deployed agents.
2. **Prompt version numbers auto-increment.** Never allow gaps or manual version numbers.
3. **Playground execution uses the org's provider API keys** from the providers table (Route module). It does NOT use AgentStack's keys.
4. **Dataset imports are synchronous for files under 1MB, async (via NATS worker) for larger files.** The 10MB file size limit is hard-enforced.
5. **OTel spans are translated once at ingest time.** After translation, they are indistinguishable from native spans. No special query paths.
6. **Webhook deliveries are fire-and-forget from the caller's perspective.** `dispatcher.Dispatch()` publishes to NATS and returns immediately. Never block business logic on webhook delivery.
7. **Webhook URLs and secrets are encrypted at rest** using the same AES-256-GCM encryption as provider API keys in the Route module (`internal/route/service/encryption.go`).
8. **Generic webhook payloads are signed with HMAC-SHA256.** Recipients SHOULD verify the signature.
9. **Webhook delivery logs are retained for 30 days.** A cleanup worker deletes older records daily.
10. **Playground streaming uses Server-Sent Events (SSE)**, not WebSockets. SSE is simpler, works through proxies, and is sufficient for one-directional streaming.

---

## 11. Testing Requirements

### Per Phase

#### Phase 9 (Prompts)
- Prompt CRUD: create, list, get, get-by-slug, update, delete
- Version management: create version, list versions, deploy, rollback
- Slug uniqueness enforcement (409 Conflict on duplicate)
- Renderer: variable interpolation, missing required variable error, unknown variable pass-through
- Pagination on list endpoints

#### Phase 10 (Playground)
- Execute: non-streaming response, correct token/cost/latency tracking
- Execute: streaming SSE response (verify SSE format)
- Compare: parallel execution, all results returned
- Rate limiting on playground endpoints
- Error handling: invalid model, provider API key missing, timeout

#### Phase 11 (Datasets)
- Dataset CRUD: create, list, get, update, delete
- Item management: add, batch add, list, delete
- Import: CSV, JSON, JSONL (valid files + malformed files)
- Export: JSON format correctness
- Suite linking: link, unlink, cascade delete
- From-session: verify session data extraction
- Item count denormalization (count stays accurate after add/delete/import)

#### Phase 12 (OTel)
- OTLP/HTTP: protobuf and JSON encoding
- Translator: OTel span → AgentStack span field mapping
- GenAI semantic conventions: token counts, model, provider extraction
- Authentication: API key in Authorization header
- Spans appear in existing Trace queries after ingestion
- Malformed/partial spans handled gracefully (partialSuccess response)

#### Phase 13 (Webhooks)
- Webhook CRUD: create, list, get, update, delete
- Test delivery: returns success/failure
- Event dispatch: publishes to NATS
- Worker delivery: successful 2xx response marks as delivered
- Worker retry: failed delivery retries with exponential backoff
- Slack formatting: valid Block Kit message
- PagerDuty formatting: valid Events API v2 payload
- HMAC signature: correct signature generation and verification
- URL/secret encryption at rest

---

## 12. Verification Workflow

Same as V1 (section 14 of CLAUDE.md). After building each page, take a screenshot to verify. After each API endpoint, test with curl. Specific verification points for V2:

1. **Prompt editor:** Verify `{{variable}}` highlighting renders correctly in the textarea
2. **Playground streaming:** Verify SSE tokens appear one-by-one with typing animation
3. **Dataset import:** Test with a real CSV file (10+ rows)
4. **OTel ingest:** Send spans using the official `otel-cli` tool or a Python OTel SDK script
5. **Webhook delivery:** Configure a Slack webhook and verify the message format in an actual Slack channel
6. **Version diff:** Create 3+ prompt versions and verify the diff view shows correct additions/deletions

---

## 13. Summary — What V2 Delivers

After V2, AgentStack has a complete closed-loop platform:

```
┌─────────────────────────────────────────────────────────┐
│                    DEVELOP                                │
│   Prompt Management: create, version, template prompts   │
│   Playground: test prompts against models instantly       │
│   Dataset Management: manage eval data, import/export    │
└──────────────────────┬──────────────────────────────────┘
                       │ deploy via SDK (fetch prompt by slug)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    DEPLOY                                 │
│   Route: gateway with routing + failover + caching       │
│   Guard: guardrails block bad inputs/outputs              │
│   OTel: ingest from any OTel-instrumented application    │
└──────────────────────┬──────────────────────────────────┘
                       │ spans flow into Trace
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    OBSERVE                                │
│   Trace: sessions, spans, analytics, patterns            │
│   Cost: spend tracking, budget enforcement               │
│   Webhooks: Slack/PagerDuty alerts on anomalies          │
└──────────────────────┬──────────────────────────────────┘
                       │ anomalies trigger healing
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    HEAL                                   │
│   Shield: auto-fix loops, hallucinations, cost overruns  │
│   Webhooks: notify team of healing events                │
└──────────────────────┬──────────────────────────────────┘
                       │ failures become test data
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    IMPROVE                                │
│   Test: run evals with datasets, quality gates           │
│   Datasets: production failures → regression test data   │
│   Prompts: iterate on prompt versions                    │
│   Playground: test improved prompts                      │
└──────────────────────┬──────────────────────────────────┘
                       │ loop back to DEVELOP
                       ▼
                    (repeat)
```

Zero dead ends. Every module feeds another. Every feature serves the loop.
