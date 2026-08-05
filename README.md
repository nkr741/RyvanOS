# RyvanOS

**Enterprise AI Operating System.** The shared platform every Ryvan product runs
on — Cortex, and NexusOS, RynOne and QAOS as they arrive.

RyvanOS contains no product-specific logic. Products bring business logic; the
platform provides capabilities.

## What it does

A product describes *what* it wants done. The platform decides whether that may
happen, plans it, carries it out durably, recovers when a dependency fails, and
records the whole thing in a form that stands up as evidence.

```typescript
const mission = platform.container.resolve<MissionService>("mission");

await mission.launch({
  type: "payroll.run",
  goal: "Run July payroll",
  subject: { userId, orgId, roles },
  estimatedCostUsd: 12.5,
});
```

Behind that one call: a policy check against rules, spend budgets and volume
quotas; a workflow plan; durable step execution with retries, timeouts and
compensation; a pause for human approval that survives a restart; connector
calls protected by circuit breakers; a hash-chained audit entry for every
decision; and a trace showing where the time and money went.

## Quick start

```bash
cp .env.example .env
openssl rand -base64 32   # for each of the three secrets in .env

docker compose up --build
```

Console on <http://localhost:4500>, health on <http://localhost:4501/healthz>.

Without Docker:

```bash
npx pnpm@9.15.0 install --filter "./packages/**"
npx pnpm@9.15.0 exec turbo build --filter="./packages/*"
npx pnpm@9.15.0 serve
```

## Packages

| Package | Does |
|---------|------|
| **common** | Types, errors, DI container, logger, glob/path/range primitives |
| **events** | Typed event bus with middleware, filters and a dead-letter queue |
| **identity** | Users, orgs, projects, RBAC, JWT, API keys |
| **secrets** | AES-256-GCM credential storage, scoped per tenant, with rotation |
| **policy-engine** | Rules, spend budgets, volume quotas, human approval gates |
| **workflow-engine** | Durable step graphs — retries, timeouts, approvals, compensation |
| **mission-engine** | Intent → policy → plan → workflow → outcome |
| **audit** | Hash-chained, tamper-evident ledger fed by the event bus |
| **observability** | Traces across mission → workflow → step → tool → model, with cost |
| **resilience** | Circuit breakers, retries, fallbacks, dead letters |
| **connector-sdk** | One contract every integration implements |
| **models** | Multi-provider routing with cost tracking |
| **memory** | Working, conversation and long-term memory, optionally vector-ranked |
| **tool-registry** | Tool definitions, validation, execution |
| **agent-runtime / agent-sdk** | Task queue, scheduler, planner, agent base class |
| **storage** | KeyValue, Document, Object, Vector and SQL ports; Postgres, pgvector, Redis |
| **persistence** | Durable implementations of every domain store |
| **console** | The Developer Console — missions, traces, approvals, audit, cost |
| **bootstrap** | One call to wire and start all of it |

## Documentation

### Governance — how we decide *(changes only by amendment)*

| Document | Covers |
|----------|--------|
| [ENGINEERING_CONSTITUTION.md](docs/ENGINEERING_CONSTITUTION.md) | The 21 rules every engineer and AI agent follows, and why each exists |
| [PLATFORM_BOUNDARY.md](docs/PLATFORM_BOUNDARY.md) | The five-test procedure answering "RyvanOS or product?" |
| [OWNERSHIP_MATRIX.md](docs/OWNERSHIP_MATRIX.md) | Exactly one owner for every capability, package and SDK surface |

### Architecture and operations — how it is built

| Document | Covers |
|----------|--------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, ports, dependency rules, start order, known gaps |
| [packages.md](docs/packages.md) | Every package, with the reasoning behind its design |
| [deployment.md](docs/deployment.md) | Docker, config, health probes, backups, security |
| [PLATFORM-ROADMAP.md](docs/PLATFORM-ROADMAP.md) | What is done, what is next, and what **not** to build |
| [getting-started.md](docs/getting-started.md) | Building a product on the platform |
| [testing-guide.md](docs/testing-guide.md) | How the suites are structured |

## Development

```bash
npx pnpm@9.15.0 install --filter "./packages/**"

npx pnpm@9.15.0 exec turbo build typecheck lint test --filter="./packages/*"
npx pnpm@9.15.0 smoke     # boots built output under plain Node
```

**460 tests.** Integration tests skip without a database; to run them:

```bash
docker run -d --name ryvan-pg -e POSTGRES_DB=ryvan_test -e POSTGRES_USER=ryvan \
  -e POSTGRES_PASSWORD=ryvan_dev -p 55432:5432 pgvector/pgvector:pg16
docker run -d --name ryvan-redis -p 56379:6379 redis:7-alpine

export RYVAN_TEST_POSTGRES_URL=postgres://ryvan:ryvan_dev@localhost:55432/ryvan_test
export RYVAN_TEST_REDIS_URL=redis://localhost:56379
```

CI runs them against real services and **fails if they are skipped** — a driver
only ever exercised against its in-memory twin is a driver nobody has tested.

## Contributing to the platform

1. **Check it does not already exist.** The do-not-build list in
   [PLATFORM-ROADMAP.md](docs/PLATFORM-ROADMAP.md) records nine packages that
   were proposed and turned out to be duplicates.
2. **No domain package imports another.** Declare a port; let bootstrap wire it.
3. **Tests, including one that would fail if the feature regressed.**
4. **No product-specific logic.** Leads, payroll, riders and test suites belong
   in a product.

## Licence

Proprietary. © Ryvan Technologies.
