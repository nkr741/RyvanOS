# RyvanOS Architecture

## What RyvanOS is

A **platform runtime**, not a product. It provides the shared infrastructure
every Ryvan product runs on.

```
RyvanOS (platform)
├── Cortex   — Enterprise Business Intelligence
├── NexusOS  — Enterprise Operations        (not started)
├── RynOne   — Consumer AI Super App        (not started)
└── QAOS     — Engineering Intelligence     (not started)
```

RyvanOS contains **zero product-specific logic**. Products bring business logic;
the platform provides capabilities. If it mentions leads, payroll, riders or
test suites, it belongs in a product.

## Core principles

1. **Build once, use everywhere.** Every improvement benefits all products.
2. **No speculative packages.** A new package needs a concrete requirement.
   Before adding one, check it does not already exist — see the do-not-build
   list in [PLATFORM-ROADMAP.md](./PLATFORM-ROADMAP.md).
3. **No domain package imports another.** Only `@ryvan/common` and
   `@ryvan/events` may be imported. Where a package needs another's behaviour
   synchronously, it declares a **port** and `@ryvan/bootstrap` supplies the
   implementation.
4. **Every capability is a `Service`** with `start()`, `stop()`, `status()`.
5. **Events use `EVENTS.*` constants**, never string literals.

## Tech stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript 5.7, ESM, `NodeNext` |
| Runtime | Node.js 22+ |
| Build | Turborepo + pnpm 9 |
| Database | PostgreSQL 16 + pgvector |
| Cache / counters | Redis 7 |
| Tests | Vitest — 460 tests, including live Postgres and Redis |

## The layers

```
                        PRODUCTS
        Cortex · NexusOS · RynOne · QAOS
                           │
   ────────────────────────┼────────────────────────
                           ▼
   ORCHESTRATION   mission-engine     "should this happen, and what does it?"
                          │
                   workflow-engine    "run these steps, durably"
                          │
   GOVERNANCE      policy-engine      "is it permitted, affordable, in quota?"
                   identity           "who is asking, and what may they hold?"
                   secrets            "credentials, sealed at rest"
                          │
   EXECUTION       agent-runtime · agent-sdk · tool-registry
                   models             "one router, every provider"
                   connector-sdk      "one contract, every vendor"
                   resilience         "retry, break, fall back, park"
                          │
   MEMORY          memory · storage · persistence
                          │
   EVIDENCE        audit              "what happened, tamper-evident"
                   observability      "what it cost and where time went"
                   console            "the window into all of it"
                          │
   FOUNDATION      common · events · bootstrap
```

## The orchestration spine

Four packages turn a request into governed, recorded work:

```
Mission      checked against policy → planned → executed → finalised
   │
Policy       rules · budgets · quotas · approval gates
   │
Workflow     DAG · retries · timeouts · approvals · compensation
   │
Audit        hash-chained ledger, fed by the event bus
```

A mission is refused before a workflow starts if policy denies it. A workflow
suspends rather than proceeds when a step needs a human. A failed run
compensates its completed steps in reverse. Every transition lands in the audit
ledger without the caller doing anything.

## Ports

Events are fire-and-forget, so they cannot answer *"may I do this?"*. A package
needing a synchronous answer declares the interface it wants; bootstrap supplies
the implementation.

| Port | Declared in | Implemented by |
|------|-------------|----------------|
| `ApprovalGate` | workflow-engine | policy-engine |
| `WorkflowRunner` | mission-engine | workflow-engine |
| `PolicyGate` | mission-engine | policy-engine |
| `ConnectorPolicyGate` | connector-sdk | policy-engine |
| `ResilienceGate` | connector-sdk | resilience |
| `ConsoleSources` | console | everything |
| `CounterStore` | policy-engine | storage (via persistence) |
| `WorkflowStore`, `MissionStore`, `AuditStore`, `ApprovalStore`, `IdentityStore`, `TraceStore`, `DeadLetterStore`, `SecretStore` | their own packages | persistence |

Adapters live in `packages/bootstrap/src/adapters.ts` and
`console-sources.ts` — the only files that know two domain packages at once,
which is exactly where that knowledge belongs.

## Integration packages

Three packages are allowed to import many others, because integration is their
job: **bootstrap** (wiring), **persistence** (durable stores), and **console**
(the inspector — which reads only through ports).

## Dependency graph

```
@ryvan/common  (leaf — no @ryvan deps)
    │
    ├── @ryvan/events
    │       │
    │       ├── identity · models · memory · tool-registry
    │       ├── agent-sdk · agent-runtime
    │       ├── policy-engine · workflow-engine · mission-engine
    │       ├── audit · observability · resilience
    │       ├── connector-sdk · secrets · storage
    │       └── console
    │
    ├── @ryvan/persistence   (storage + the domain packages it persists)
    └── @ryvan/bootstrap     (everything — wires it together)
```

## Bootstrap

```typescript
import { bootstrap } from "@ryvan/bootstrap";

const platform = await bootstrap({
  identity: { tokenSecret: process.env.RYVAN_JWT_SECRET! },
  models: { defaultModel: "claude-haiku-4-5" },

  // Omit this and everything runs in memory — nothing survives a restart.
  storage: {
    postgresUrl: process.env.RYVAN_POSTGRES_URL,
    redisUrl: process.env.RYVAN_REDIS_URL,
  },

  console: { token: process.env.RYVAN_CONSOLE_TOKEN! },
});

platform.enableGracefulShutdown();

const mission = platform.container.resolve<MissionService>("mission");
```

Resolvable names: `logger`, `events`, `identity`, `secrets`, `policy`,
`resilience`, `observability`, `audit`, `models`, `memory`, `tools`,
`connectors`, `workflow`, `mission`, `agent-runtime`, `agent-sdk`, `documents`,
`cache`, `vectors`, and `console` when configured.

> `events` is registered but **not** in the start order — `EventBus` has no
> lifecycle and is live once constructed.

## Start order

```
identity → secrets → policy → resilience → observability → audit →
models → memory → tools → connectors → workflow →
agent-sdk → agent-runtime → mission → console
```

Storage drivers connect **before** any service and disconnect **after** all of
them. Audit and observability start early so they capture what follows. Mission
starts last because it drives everything below it. The console starts last of
all — an inspector must never be the reason the platform fails to come up.

## Multi-tenancy

| Concern | Where |
|---------|-------|
| Organization → Project | `identity` |
| Roles and permissions | `identity` (RBAC, hierarchical, org/project scoped) |
| API keys | `identity` |
| Credentials | `secrets` — AES-256-GCM, scoped per org/project |
| Spend ceilings | `policy-engine` `BudgetGuard` |
| Volume ceilings | `policy-engine` `QuotaGuard` |
| Data isolation | Every durable record carries its scope; stores filter on it |

**There is deliberately no "Workspace" entity.** `Project` already is that
layer — adding both would give two names for one concept, and every store,
filter and permission would have to understand the difference.

## Event-driven coupling

```typescript
const events = platform.container.resolve<EventBus>("events");

events.on(EVENTS.MISSION_COMPLETED, (event) => {
  // event.type, event.data, event.correlationId, event.timestamp
});
```

`correlationId` is the trace id. A mission generates one and passes it to its
workflow, so everything beneath one mission shares a trace — which is what lets
observability assemble a span tree from events alone, with no service
instrumented for it.
