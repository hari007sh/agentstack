# AgentStack — Claude Code Project Instructions

## Project Overview
AgentStack is an open-source AI agent production platform with 6 modules: Shield (self-healing), Trace (observability), Test (evaluation), Guard (guardrails), Route (gateway), Cost (cost intelligence).

## Quality Standard: PRODUCTION, Not MVP
This is NOT an MVP. Every feature must be production-quality:
- Full error handling on every API endpoint
- Input validation on every request
- Proper HTTP status codes (201 for created, 202 for async, 400 for bad input, 401 for unauthorized, 404 for not found, 409 for conflict, 429 for rate limited, 500 for server error)
- Comprehensive test coverage for critical paths
- Beautiful, polished UI with animations, loading states, empty states, error states
- Responsive design (works on mobile, tablet, desktop)
- Accessibility basics (proper labels, keyboard navigation, contrast ratios)

## Build + Verify Workflow

After building EACH significant UI component or page, you MUST verify it visually:

### Step 1: Start the servers
```bash
# Terminal 1: Docker services
docker compose up -d

# Terminal 2: Go API server
make dev

# Terminal 3: Next.js
cd web && npm run dev
```

### Step 2: After building any dashboard page, verify with browser tools

Use Playwright MCP to verify pages:
```
1. Navigate to the page (http://localhost:3000/dashboard/...)
2. Take a screenshot to verify layout
3. Check for visual issues (alignment, spacing, colors)
4. Test interactive elements (click buttons, hover states)
5. Test responsive: resize to mobile width (375px) and take screenshot
6. Fix any issues found before moving to next page
```

Use Chrome DevTools MCP for deeper inspection:
```
1. Navigate to the page
2. Take a screenshot for visual verification
3. Run Lighthouse audit for performance and accessibility scores
4. Check console for errors or warnings
5. Inspect network requests for failed API calls
6. Verify dark theme renders correctly (no white flashes, proper colors)
```

### Step 3: After building any API endpoint, verify with curl
```bash
# Test health
curl http://localhost:8080/health

# Test with API key
curl -H "Authorization: Bearer as_sk_test123" http://localhost:8080/v1/sessions

# Test error handling
curl -X POST http://localhost:8080/v1/ingest/sessions -d '{}' # should return 400
```

### Step 4: After building SDK features, verify with test scripts
```python
# Create test_sdk.py and run it
import agentstack
agentstack.init(api_key="as_sk_test", endpoint="http://localhost:8080")

with agentstack.session(agent_name="test") as session:
    with session.span("test_span", span_type="llm_call") as span:
        span.set_output("test output")
        span.set_tokens(100, 50)

print("SDK test passed!")
```

## UI/UX Requirements (Non-Negotiable)

### Design System
- Dark theme ONLY (no light mode in V1)
- Font: Inter for UI, JetBrains Mono for code blocks
- Colors: see CLAUDE.md in project root for full palette
- Border radius: 12px for cards, 8px for buttons, 6px for inputs
- Spacing: 4px grid system (4, 8, 12, 16, 20, 24, 32, 40, 48)

### Every Page Must Have:
1. **Loading state** — skeleton shimmer matching the content layout shape. NEVER show a spinner.
2. **Empty state** — icon + message + CTA button. Unique per page.
3. **Error state** — red banner with error message and retry button
4. **Responsive layout** — test at 1440px, 1024px, 768px, 375px widths

### Animation Rules
- Use Framer Motion for all transitions
- Page transitions: fadeIn (opacity 0→1, y 8→0, 300ms)
- List items: stagger (50ms delay between items)
- Metric cards: count-up animation on mount
- Status dots: healed status has pulse glow animation
- Charts: draw-in animation on mount (clip-path reveal)
- Modals: backdrop blur + scale from 0.95→1
- NEVER animate something that doesn't need animating — subtle > flashy

### Chart Design
- Use D3.js or Recharts (pick one, be consistent)
- Dark background matching page
- Grid lines: rgba(255,255,255,0.05) — barely visible
- Area charts: gradient fill from accent color to transparent
- Smooth curves: curveMonotoneX interpolation
- Hover tooltip: dark card with backdrop-blur, clean data display
- Axis labels: text-xs text-tertiary

### Component Library
- Use shadcn/ui as the base
- Customize to match dark theme (override default light styles)
- Run: `npx shadcn@latest init` then add components as needed
- Required components: Button, Input, Select, Dialog, Dropdown, Table, Tabs, Toast, Badge, Card, Skeleton

## Testing Requirements

### Go Backend Tests
```bash
# Run all tests
make test

# Test coverage
go test ./... -cover
```

Required test coverage:
- All API endpoint handlers (happy path + error cases)
- Credit/cost calculations (integer arithmetic correctness)
- Permission/auth middleware
- Pattern matching engine
- Evaluator engine (each evaluator type)
- PII detection (each regex pattern)
- Guardrail engine (parallel execution, short-circuit)
- Gateway routing (rule matching, fallback chains)
- Budget enforcement logic

### Python SDK Tests
```bash
cd sdk/python && pytest -v
```

Required tests:
- Client initialization
- Session/span lifecycle
- @trace decorator
- Healing engine (each healer type)
- Batch sending
- Auto-instrumentation (mock OpenAI calls)

### TypeScript SDK Tests
```bash
cd sdk/typescript && npm test
```

Required tests:
- Client initialization
- Session/span lifecycle
- Trace wrapper
- Healing engine
- Type exports

### E2E Tests (After Dashboard Is Built)
Use Playwright MCP to run E2E verification:
1. Login flow (GitHub OAuth mock or direct session)
2. Navigate to each dashboard page — verify no errors
3. Sessions list loads and displays data
4. Session detail page renders timeline
5. Create/edit/delete operations work on all CRUD pages
6. Charts render with data
7. Responsive layout at mobile widths

## Code Quality Rules

### Go
- Use `golint` and `go vet` before committing
- No unused imports or variables
- All exported functions have doc comments
- Error handling: ALWAYS check errors, never ignore with `_`
- Use `context.Context` for all service/store methods
- Use structured logging (log/slog)

### TypeScript/React
- Strict mode enabled (`"strict": true` in tsconfig)
- No `any` types — use proper interfaces
- Functional components only, no class components
- Use hooks for state management
- No inline styles — use Tailwind classes
- Server components by default, `'use client'` only when needed (animations, state, event handlers)

### SQL
- All queries use parameterized arguments — NEVER string interpolation
- All tables have created_at timestamps
- Use UUID primary keys (gen_random_uuid())
- Index foreign keys and commonly queried columns
- Migrations must be reversible (up AND down)

## File Organization
- One handler per file (sessions.go, not handlers.go with everything)
- One service per file matching the handler
- Group by module (internal/trace/, internal/shield/, etc.)
- Shared code in internal/auth/, internal/model/
- No circular dependencies between modules

## Git Commit Style
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Commit after each completed sub-task (not one giant commit)
- Example: `feat(trace): add session ingestion API endpoints`
- Example: `feat(shield): implement loop breaker healing strategy`
- Example: `fix(guard): correct PII regex for international phone numbers`
- Example: `chore: add docker-compose with all services`
