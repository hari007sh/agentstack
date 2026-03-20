# AgentStack — Fresh Start Guide

## Prerequisites

Install these on your Mac before starting:

```bash
# Core tools
brew install go node redis tmux

# Docker runtime (pick one)
brew install --cask docker        # Docker Desktop (easier)
# OR
brew install colima               # Lightweight alternative
colima start --cpu 4 --memory 8 --disk 40

# Claude Code
npm install -g @anthropic-ai/claude-code

# Claude Code plugins (for UI verification)
claude plugins install @anthropic-ai/claude-code-chrome-devtools-mcp
claude plugins install @anthropic-ai/claude-code-playwright

# Playwright browser (for E2E verification)
npx playwright install chromium

# Python (for SDK development)
brew install python@3.12
pip3 install pytest build twine

# Go tools
go install golang.org/x/tools/cmd/goimports@latest
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

## Setup (5 minutes)

```bash
# 1. Create project directory and copy files
mkdir -p ~/agentstack
cp -r /path/to/agentstack-fresh/* ~/agentstack/
cp -r /path/to/agentstack-fresh/.claude ~/agentstack/.claude

# Verify file structure
ls -la ~/agentstack/
# Should show:
#   CLAUDE.md
#   START.md
#   .claude/
#   .claude/settings.json
#   .claude/CLAUDE.md
#   specs/
#   specs/spec-core.md
#   specs/spec-test-cost.md
#   specs/spec-route-guard.md

# 2. Initialize git
cd ~/agentstack
git init
git add -A
git commit -m "chore: initial project specs and claude configuration"

# 3. Open Chrome (needed for DevTools MCP)
open -a "Google Chrome" http://localhost:3000

# 4. Start Claude Code
cd ~/agentstack
claude
```

## The Prompt

Paste this into the Claude Code session:

```
Read CLAUDE.md completely. This is the master specification for AgentStack — an open-source AI agent production platform with 6 modules (Shield, Trace, Test, Guard, Route, Cost).

Also read .claude/CLAUDE.md for project-level coding standards, UI/UX requirements, testing requirements, and the mandatory verification workflow.

You have access to Chrome DevTools MCP and Playwright MCP plugins. After building each dashboard page, you MUST:
1. Take a screenshot to verify the UI renders correctly
2. Test at mobile width (375px)
3. Check the browser console for errors
4. Run a Lighthouse audit for accessibility

Build the ENTIRE platform from scratch following the build order in CLAUDE.md. Start with Phase 1 (Foundation). When you reach a module-specific phase, read the corresponding spec file:
- Phase 2-3 (Trace + Shield): read specs/spec-core.md
- Phase 4 (Test) + Phase 7 (Cost): read specs/spec-test-cost.md
- Phase 5 (Guard) + Phase 6 (Route): read specs/spec-route-guard.md

This is a PRODUCTION build, not an MVP. Every page needs:
- Dark theme with Inter font
- Framer Motion animations (fadeIn, stagger, count-up)
- Skeleton loading states (shimmer, not spinners)
- Empty states with icons and CTAs
- Error states with retry buttons
- Responsive design (test at 1440px, 1024px, 768px, 375px)
- shadcn/ui components customized to dark theme

Write tests for all critical paths. Commit after each completed sub-task with conventional commit messages.

Build sequentially. Do not skip phases. Do not ask questions — every decision is in the specs.

Start now with Phase 1: Foundation.
```

## What Gets Built

| Phase | Days | What | Verification |
|-------|------|------|-------------|
| 1. Foundation | 1-3 | Go project, Docker, migrations, Next.js, shadcn/ui, auth, design system | Docker services healthy, Next.js renders, dark theme applied |
| 2. Trace | 4-7 | Observability, session replay, failure patterns, SDKs | Take screenshots of all pages, test SDK with script |
| 3. Shield | 8-10 | Self-healing SDK (Python + TS), healing dashboard | Run healing test script, verify healing page |
| 4. Test | 11-14 | 15 evaluators, test suites, CI/CD gates, CLI | Run CLI commands, verify test pages |
| 5. Guard | 15-17 | 8 guardrails (PII, injection, toxicity, etc.) | Test PII detection, verify guard pages |
| 6. Route | 18-21 | Model gateway, 6 providers, caching, fallbacks | Test proxy with curl, verify route pages |
| 7. Cost | 22-24 | Per-outcome tracking, budgets, model comparison | Verify cost pages, test budget enforcement |
| 8. Polish | 25-28 | Landing page, docs, responsive, error handling | Full Lighthouse audit, mobile screenshots |

## Available Claude Code Tools

The Claude Code session has these tools configured:

| Tool | What It Does | When To Use |
|------|-------------|-------------|
| **Playwright MCP** | Browser automation, screenshots, click testing | After building any UI page |
| **Chrome DevTools MCP** | DOM inspection, Lighthouse audits, console logs, network requests | Deep UI debugging, performance/a11y audits |
| **Read/Write/Edit** | File operations | Building all code |
| **Bash** | Run commands | go build, npm, docker, tests, curl |
| **Glob/Grep** | Search files/content | Finding code patterns |

## Resource Usage

| Service | RAM | CPU |
|---------|-----|-----|
| PostgreSQL | ~500MB | Low |
| ClickHouse | ~1GB | Low |
| Redis | ~100MB | Low |
| NATS | ~50MB | Low |
| Go server | ~100MB | Low |
| Next.js dev | ~500MB | Medium |
| Chrome (for DevTools) | ~500MB | Low |
| **Total** | **~3GB** | Low-Medium |

Mac Mini M4 64GB has massive headroom.

## Monitoring Progress

While Claude Code is building, you can watch in real-time:

```bash
# In a separate terminal
tmux new-session -s monitor

# Watch Docker services
docker compose ps

# Watch Go server logs (once running)
make dev 2>&1 | tail -f

# Watch Next.js (once running)
cd web && npm run dev 2>&1 | tail -f

# Watch file changes
watch -n 5 'find . -name "*.go" -newer /tmp/last-check | head -20; touch /tmp/last-check'
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Docker not starting | `colima start --cpu 4 --memory 8` or restart Docker Desktop |
| Port already in use | `lsof -i :8080` then `kill <PID>` |
| ClickHouse out of memory | Increase Colima memory: `colima stop && colima start --memory 12` |
| Next.js build fails | `cd web && rm -rf node_modules .next && npm install` |
| Go module errors | `go mod tidy` |
| Chrome DevTools not connecting | Restart Chrome, ensure it's at localhost:3000 |
| Playwright browser missing | `npx playwright install chromium` |
