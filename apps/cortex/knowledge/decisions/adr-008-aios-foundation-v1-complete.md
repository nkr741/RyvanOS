# ADR-008: AIOS Foundation v1 Complete

## Status

Accepted

## Date

2026-07-21

## Context

Ryvan AIOS was created to solve a concrete problem: Cortex embedded infrastructure concerns (identity, models, memory, events, tools, execution) directly in product code. This made it impossible to reuse those capabilities across RYN or RynOne without duplicating implementation.

Over ten sprints across two phases, AIOS was built incrementally and validated continuously against Cortex as its first consumer.

### What Foundation v1 includes

| Capability | Package / Location | Validated By |
|---|---|---|
| Identity & auth | `@ryvan/identity` | Cortex password hashing, JWT claims |
| Model routing | `@ryvan/models` | JARVIS tool-use loop, all LLM calls |
| Memory management | `@ryvan/memory` | Agent memory per mission |
| Event bus | `@ryvan/events` | All Cortex event publishing + DB persistence |
| Tool registry | `@ryvan/tool-registry` | 7 JARVIS tools, agent tool execution |
| Agent runtime | `@ryvan/agent-runtime` | BaseAgent lifecycle (not rewritten — Cortex-specific) |
| Agent SDK | `@ryvan/agent-sdk` | Agent development interface |
| Common utilities | `@ryvan/common` | Shared types, config, error handling |
| Bootstrap | `@ryvan/bootstrap` | `createPlatform()` / `bootstrap()` with DI + lifecycle |
| Execution Engine | `src/cortex/execution/engine.ts` | Unified orchestrator + playbook execution |
| Structured logging | Pino + `withApi()` wrapper | All 45 API routes, zero console.error server-side |
| Request context | AsyncLocalStorage chain | HTTP → Logger → Mission → LLM → Email → Webhook |
| Cost tracking | `LlmUsageLog` + correlation IDs | Per-mission cost aggregation, observability dashboard |
| Email infrastructure | Resend SDK + `EmailLog` | Outreach pipeline with approval-then-send |
| Webhook security | HMAC-SHA256 + svix protocol | Resend delivery webhooks |
| Testing foundation | Vitest + 35 tests | Engine, API wrapper, logger, request context, webhooks |

### Principles that guided its evolution

1. **Products drive platform evolution.** No AIOS package exists without at least one real product need.
2. **Capabilities are extracted from products, not invented in advance.** The Execution Engine was built after two execution systems proved duplication was painful — not before.
3. **AIOS owns infrastructure; products own business logic.** Mission templates, agent implementations, playbook definitions, prospect context — all stay in Cortex.
4. **Adapters are preferred over rewrites.** Cortex's BaseAgent was wrapped, not replaced. Executor was wrapped, not replaced. Every AIOS adoption sprint preserved existing product behavior.
5. **Defer what lacks evidence.** Knowledge Graph, Evaluation Framework, Learning Engine, Plugin Marketplace, Repository Layer, JSONB migration — all deferred because no product needed them yet.

### Ownership boundaries

**AIOS owns:**
- Identity (authentication, password hashing)
- Model routing (provider abstraction, adapter pattern)
- Memory management (agent-scoped, mission-scoped)
- Event bus (publish, subscribe, replay, persistence middleware)
- Tool registry (registration, execution, manifest)
- Execution Engine (lifecycle, sequencing, cost aggregation, retry, cancel, resume, failure policy)
- Bootstrap and DI container
- Structured logging infrastructure

**Cortex owns:**
- Agent implementations (ResearchAgent, ProposalAgent, GrowthAgent, etc.)
- Agent lifecycle (10-state BaseAgent state machine)
- Mission templates (merchant_acquisition, company_research, etc.)
- Playbook definitions and executor implementations
- Prospect/company domain model
- Outreach and email business logic
- Approval policies and notification content
- Admin UI and API routes
- JARVIS conversational assistant

## Decision

Declare AIOS Foundation v1 complete. Future platform work follows a new decision rule:

- If a capability only helps Cortex, it belongs in Cortex.
- If a capability helps Cortex **and** RYN, or Cortex **and** RynOne, it becomes an AIOS capability.
- No new AIOS package without evidence from at least one running product.

The engineering mission changes from "build the platform" to "make Cortex successful." Success is measured by product outcomes (cost per lead, agent success rate, email conversion, mission duration), not by platform completeness.

## Consequences

### Positive

- AIOS stops growing speculatively. Every future addition has a product justification.
- Engineering effort shifts to operational validation — running Cortex with real campaigns, measuring what matters.
- RYN migration will test whether AIOS abstractions are truly reusable outside Cortex.
- The platform becomes invisible infrastructure rather than the center of attention.

### Negative

- Features that "obviously" belong in AIOS must wait until a product proves they're needed. This requires discipline.
- RYN and RynOne adoption may surface missing capabilities that require backfilling.

### What comes next

1. **Cortex Operational Validation** — Run real outreach campaigns. Measure cost per lead, agent success rate, email conversion, latency. Find bottlenecks. Improve based on evidence.
2. **RYN Migration** — Test AIOS reusability with the adapter strategy that worked for Cortex.
3. **RynOne** — Stays product-focused until it genuinely benefits from AIOS capabilities.
4. **AIOS Foundation v2** — Expected to emerge from the experience of three products, not designed in advance.

## References

- ADR-007: Unified Execution Engine (Sprint 5B)
- Sprint 5A review: "AIOS Foundation declared complete"
- Sprint 5B review: "AIOS Foundation v1 is complete"
- Governance rule: "Every significant engineering effort must answer: Does this improve Cortex's ability to acquire customers or operate reliably?"

---

*Template: Ryvan Engineering System (RES) — Cortex Growth / rynOne*
