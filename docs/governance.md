# Platform Governance

## The Three Rules

Every new AIOS package must satisfy all three conditions:

1. **A product has a real need.** Cortex (or another product) is blocked without this capability.
2. **The capability is reusable.** At least two products would benefit from it.
3. **It reduces duplication.** It replaces code that would otherwise be copy-pasted between products.

If a capability fails any of these tests, it belongs in the product, not the platform.

## Team Structure (Future)

```
Platform Team (AIOS)
├── Owns: packages/*
├── Responsibility: shared infrastructure quality
└── Rule: never ship a feature a product didn't ask for

Cortex Team
├── Owns: apps/cortex
├── Responsibility: business intelligence product
└── Requests: platform capabilities via issues

RYN Team
├── Owns: apps/ryn
└── Requests: platform capabilities via issues

RynOne Team
├── Owns: apps/rynone
└── Requests: platform capabilities via issues
```

## Code Ownership

| Path | Owner | Review Required |
|------|-------|----------------|
| `packages/common/` | Platform Team | 1 platform reviewer |
| `packages/events/` | Platform Team | 1 platform reviewer |
| `packages/identity/` | Platform Team | 1 platform + 1 security reviewer |
| `packages/models/` | Platform Team | 1 platform reviewer |
| `packages/memory/` | Platform Team | 1 platform reviewer |
| `packages/tool-registry/` | Platform Team | 1 platform reviewer |
| `packages/agent-runtime/` | Platform Team | 1 platform reviewer |
| `packages/agent-sdk/` | Platform Team | 1 platform reviewer |
| `packages/bootstrap/` | Platform Team | 1 platform reviewer |
| `apps/cortex/` | Cortex Team | 1 product reviewer |
| `docs/` | Any team | 1 reviewer |

## Breaking Change Policy

AIOS packages are consumed by multiple products. Breaking changes require:

1. A deprecation notice in the current minor version
2. A migration guide in `docs/`
3. All consuming products updated in the same PR (or coordinated PRs)

## Quality Gates

Every PR to `packages/` must pass:

- [ ] TypeScript typecheck (`pnpm typecheck`)
- [ ] ESLint (`npx eslint`)
- [ ] Prettier (`npx prettier --check`)
- [ ] Semgrep security scan (`semgrep scan --config auto packages/`)
- [ ] Tests pass (`pnpm test`)
- [ ] No new `any` types
- [ ] No new dependencies without platform team approval

## Decision Log

Major architectural decisions are tracked in memory files and conversation history. Key decisions:

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-21 | Phase 1: 8 packages | Core agent loop — minimum viable platform |
| 2026-07-21 | PG + Redis + S3 only | Avoid infrastructure sprawl |
| 2026-07-21 | No LangChain/LangGraph | Native runtime = intellectual property |
| 2026-07-21 | Product-first expansion | Only build what Cortex demands |
| 2026-07-21 | Adapter migration | Never replace directly, always wrap first |
| 2026-07-21 | Identity migrated last | Highest risk, touches every request |
