# RyvanOS Platform Roadmap — Path to v1.0

> Status date: 2026-08-03
> Purpose: define exactly what RyvanOS still needs before any second product (NexusOS, RynOne, QAOS) is started.
> Rule: **nothing is added here that already exists.** Every proposed package below was checked against the current source tree first.

---

## 1. What already exists

Nine packages ship today. Their real, verified capabilities:

| Package | Implements | Notable gaps |
|---------|-----------|--------------|
| `@ryvan/common` | DI container, logger, config, 15 error types, Zod validation, `EVENTS` catalogue, `Service` lifecycle | `IEventBus` here contradicts the one in `@ryvan/events` |
| `@ryvan/events` | Event bus, middleware chain, filtered subscriptions, dead-letter queue, 1000-event history | In-memory only; no cross-process transport |
| `@ryvan/identity` | Users, password hashing, JWT, API keys, RBAC with role hierarchy and org/project scoping | In-memory stores; no persistence |
| `@ryvan/models` | Provider registry, model router with routing hints (cost/local/capability), cost tracker | No caching, no fallback-on-failure, no policy hook |
| `@ryvan/memory` | Working memory, conversation memory, memory manager, in-memory backend | No vector backend; `MemoryType.Vector`/`Semantic` unimplemented |
| `@ryvan/tool-registry` | Tool definitions, parameter validation, timeout, middleware, per-tool stats | No permission check before execution |
| `@ryvan/agent-runtime` | Task queue, scheduler (concurrency, retry, timeout, drain-on-shutdown), planner strategy registry | `ExecutionPlan` is produced but **never executed** — no step executor |
| `@ryvan/agent-sdk` | Abstract agent base, collaboration primitives | — |
| `@ryvan/bootstrap` | Wires all services into a container with ordered start/stop and graceful shutdown | — |

### Do NOT create these packages — they already exist

Common proposals that would duplicate working code:

- ~~`packages/planner`~~ → `agent-runtime/src/planner.ts` (`PlannerStrategy` registry). Add a **strategy**, not a package.
- ~~`packages/scheduler`~~ → `agent-runtime/src/scheduler.ts`. Time/cron triggers belong **inside** it.
- ~~`packages/model-router`~~ → `models/src/router.ts` + `cost-tracker.ts`.
- ~~`packages/auth`, `packages/permissions`, `packages/organizations`~~ → `identity/` already covers all three.
- ~~`packages/reasoning`~~ → a `PlannerStrategy` implementation.
- ~~`packages/vector` **and** `packages/rag` as separate packages~~ → a `VectorBackend` implementing the existing `MemoryBackend` port in `memory/`.

---

## 2. The real gaps

The platform can define work but cannot *carry it out*. `RuntimeService.submit()` builds an `ExecutionPlan` and enqueues a task — then nothing executes the plan's steps. That is the hole everything else hangs off.

`@ryvan/common` already reserves the vocabulary for the missing layers, which confirms the intent:

- `WorkflowStepType` — sequential, parallel, conditional, approval, retry, rollback, timeout, compensation, schedule, event
- `SecurityAction` — policy_check, approval_check, pii_detection, prompt_injection, secrets_detection
- `EVENTS.MISSION_*`, `EVENTS.WORKFLOW_*`, `EVENTS.APPROVAL_*`, `EVENTS.CONNECTOR_*`, `EVENTS.KNOWLEDGE_*`
- `WorkflowError`, `ConnectorError`

None of these have an implementation.

### Priority order

**Tier 1 — the orchestration spine (blocks everything) — DONE**

1. ✅ `@ryvan/policy-engine` — guardrails, budget limits, approval gates. 39 tests.
2. ✅ `@ryvan/workflow-engine` — durable step-graph execution. 38 tests.
3. ✅ `@ryvan/mission-engine` — intent → policy → plan → workflow → outcome. 16 tests.
4. ✅ `@ryvan/audit` — hash-chained append-only ledger. 14 tests.
5. ✅ `@ryvan/connector-sdk` — the connector contract and registry. 17 tests.
6. ✅ Wired into `@ryvan/bootstrap` via ports, with 7 end-to-end tests.

**Tier 2 — enterprise surface**

7. ✅ `@ryvan/storage` — `KeyValueStore`, `DocumentStore`, `ObjectStore`, `VectorStore`, `SqlClient` ports with in-memory, Postgres (+pgvector) and Redis drivers, plus a migration runner. 84 tests, 41 of them against live Postgres and Redis.
8. ✅ `@ryvan/persistence` — durable `WorkflowStore`, `MissionStore`, `AuditStore`, and `IMemoryBackend`, written against the generic `DocumentStore` so the same class runs in-memory in tests and on Postgres in production. 20 tests.
9. ✅ Bootstrap storage wiring — `storage.postgresUrl` is the single switch that makes everything durable. Verified by a restart test that boots, stops, and re-boots against the same database.
10. `@ryvan/observability` — spans/traces over mission → agent → tool → model. `LogEntry` already carries `traceId`/`spanId` with nothing populating them. **Next.**
11. Tenant context on model calls — `ModelRouter` emits usage with no `orgId`, so budget enforcement can only work at global scope. Until this lands, per-organisation model ceilings are not possible.
12. First connectors on the SDK — Slack, Jira, and one system of record.

### Known gaps in persistence

- **Approvals are not durable.** `ApprovalStore` is in-memory, so a restart loses pending approvals and a workflow waiting on one resumes to `expired`. `ApprovalStore` needs the same `DocumentStore` treatment the other stores got. Covered by a test in `packages/bootstrap/src/durability.test.ts` that documents the behaviour rather than asserting it is correct.
- **Identity is not durable.** Users, orgs, projects, and API keys are still in-memory maps.
- **Document writes do not join an ambient transaction.** `PostgresDriver.transaction()` only enrols statements issued on the client it hands you; `put`/`get`/`find` run on the pool.

**Tier 3 — after Tier 1 and 2 are stable**

8. `@ryvan/knowledge-graph` — `KNOWLEDGE_*` events reserved.
9. Vector backend for `@ryvan/memory` — enables RAG without a new package.
10. `@ryvan/notification`, `@ryvan/billing`, `@ryvan/design-system`.

### Cross-cutting debt

Found and fixed while building Tier 1:

- ✅ **`bootstrap()` never worked.** `EventBus` was listed in `SERVICE_START_ORDER` but has no lifecycle, so the first iteration threw `service.start is not a function`. No test existed to catch it. Removed from the order; `start()` now fails loudly and by name if a registered entry does not implement `Service`.
- ✅ **Stale `tsconfig.tsbuildinfo` files were committed.** `tsc` read them, believed the output was current, and emitted no `dist/` — so a fresh clone could not build at all. Deleted and added to `.gitignore`.
- ✅ **Duplicate `IEventBus`.** `common/interfaces.ts` declared one whose handlers took the payload, while the real one in `events/types.ts` passes a `RyvanEvent` envelope. Code typed against `common` could not accept the actual `EventBus`. Removed the duplicate — nothing imported it.
- ✅ **The platform could not run under plain Node.** `@ryvan/identity` used named imports from `bcryptjs`, which is CommonJS: `import { hash, compare } from "bcryptjs"` throws `does not provide an export named 'compare'` in native ESM. Vitest's bundler papered over it, so every test passed while `node dist/index.js` failed instantly. Fixed by destructuring the default export.
- ✅ **Audit hashes were not stable across storage.** `hashEntry` used `JSON.stringify`, which emits keys in insertion order. Postgres JSONB reorders keys on write, so every entry failed verification after a round-trip — a perfectly intact ledger reported as tampered. Hashing is now over a canonical serialisation with keys sorted at every depth (array order still significant). Found by the restart test, not by any unit test.

Still open:

- **The nine original packages have no tests.** Their `test` script now passes with `--passWithNoTests` so `turbo test` is green, but `identity`, `models`, `memory`, `tool-registry`, and `agent-runtime` carry real logic — RBAC inheritance, routing hints, retry and drain behaviour — with nothing covering it. The five new packages have 124 tests; the rest have 0.
- **No CI.** Nothing runs build/typecheck/lint/test on push.
- **No persistence layer.** See Tier 2 item 8.
- **The repository is not under git.** No history, no branches, no way to undo a bad refactor.
- **Identity emits string literals**, not `EVENTS.*` constants. The constants now exist (`EVENTS.IDENTITY_*`); the call sites still need migrating.

---

## 3. Architectural rules these packages must follow

Carried over from `architecture.md`, and non-negotiable for new work:

1. **No domain package imports another domain package.** Only `@ryvan/common` and `@ryvan/events` may be imported.
2. Where a package needs another's behaviour, it declares a **port** (a local interface) and `@ryvan/bootstrap` injects the implementation. Example: `mission-engine` defines `WorkflowRunner`; bootstrap supplies the `workflow-engine` instance.
3. Every package exports a facade implementing `Service` (`start`/`stop`/`status`).
4. Every package emits its lifecycle via `EVENTS.*` constants — never string literals.
5. No product-specific logic. If it mentions leads, payroll, riders, or test suites, it belongs in a product, not here.

---

## 4. Sequencing

| Phase | Deliverable | Exit criterion |
|-------|------------|----------------|
| 1 ✅ | policy-engine, workflow-engine, mission-engine, audit, connector-sdk, bootstrap wiring | **Met.** A mission runs end-to-end through a policy check, a suspended approval gate, a resumed workflow, and a verified audit chain — see `packages/bootstrap/src/platform.test.ts` |
| 2 | observability, tests for the original nine packages, CI | Every mission produces a trace; `turbo test` green in CI with real coverage |
| 3 | Postgres persistence, tenant context on model calls | Platform survives restart; per-org budgets enforceable |
| 4 | Cortex refactored to consume only platform packages | Cortex has no `src/cortex/runtime` adapters left |
| 5 | Tag RyvanOS v1.0, freeze public APIs | Semver enforced; breaking changes require a major |
| 6 | Start NexusOS | NexusOS contains business logic only |

**NexusOS does not start before Phase 5.** Anything Cortex needs that the platform lacks gets added to the platform first, then consumed — never implemented inside Cortex.

---

## 5. On renaming `apps/` → `products/`

Deferred, deliberately. It touches `pnpm-workspace.yaml`, `turbo.json`, Cortex's `Dockerfile`, three compose files, the nginx config, and seven documents — for no technical gain. Do it in a single dedicated commit **after** the repository is under git, not while the platform layer is in flux.
