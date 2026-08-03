# Ryvan AIOS Architecture Guide

## What is AIOS?

Ryvan AIOS is a **platform runtime**, not a product. It provides the shared infrastructure that all Ryvan products run on.

```
RYVAN AIOS (platform)
├── Cortex   — Enterprise Business Intelligence & Autonomous Operations
├── RYN      — Enterprise Autonomous Quality Engineering Platform
└── RynOne   — Consumer AI Super App
```

AIOS contains **zero product-specific logic**. Products bring business logic; AIOS provides capabilities.

## Core Principles

1. **Build once, use everywhere.** Every improvement to AIOS benefits all products instantly.
2. **No speculative packages.** New AIOS packages require a concrete product requirement.
3. **Capability-based execution.** The runtime executes capabilities (memory, planning, tools), never product-specific logic.
4. **Event-driven coupling.** Packages never import each other. Inter-package communication is exclusively through the EventBus.

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 22+ |
| Module System | ESM (ES2022) | - |
| Build | Turborepo + pnpm | 2.x / 9.x |
| Database | PostgreSQL | 16 |
| Cache | Redis | (Phase 2+) |
| Storage | S3-compatible | (Phase 2+) |

## Monorepo Structure

```
ryvan-platform/
├── packages/           # AIOS platform packages
│   ├── common/         # Types, errors, utils, DI container
│   ├── events/         # Typed event bus with middleware
│   ├── identity/       # Auth, RBAC, JWT, API keys, orgs, projects
│   ├── models/         # Multi-provider model routing, cost tracking
│   ├── memory/         # Working, conversation, long-term memory
│   ├── tool-registry/  # Tool definitions, validation, execution
│   ├── agent-runtime/  # Task queue, scheduler, planner
│   ├── agent-sdk/      # Abstract agent base class, collaboration
│   ├── policy-engine/  # Guardrails, spend budgets, approval gates
│   ├── workflow-engine/# Durable step-graph execution
│   ├── mission-engine/ # Mission lifecycle over policy + workflow
│   ├── audit/          # Append-only, hash-chained audit ledger
│   ├── connector-sdk/  # Connector contract, base class, registry
│   └── bootstrap/      # One-line platform initialization
├── apps/               # Products built on AIOS
│   └── cortex/         # Enterprise intelligence platform
├── docs/               # Developer documentation
├── turbo.json          # Build pipeline configuration
├── pnpm-workspace.yaml # Workspace definition
└── tsconfig.base.json  # Shared TypeScript config
```

## The Orchestration Spine

Four packages turn a request into governed, recorded work. Each layer answers
one question, and none of them knows about any product:

```
Mission      "Should this happen, and what carries it out?"
    │        policy check → plan → workflow → outcome
    ▼
Policy       "Is this permitted, and can we afford it?"
    │        rules · budgets · approval gates
    ▼
Workflow     "Run these steps, durably."
    │        DAG · retries · timeouts · approvals · compensation
    ▼
Audit        "What actually happened?"
             hash-chained ledger fed by the event bus
```

A mission is refused before a workflow starts if policy denies it; a workflow
suspends rather than proceeds when a step needs a human; a failed run
compensates its completed steps in reverse. Every one of those transitions
lands in the audit ledger without the caller doing anything.

## Dependency Graph

All domain packages depend on `common` and `events`. No domain package imports another domain package. They communicate through the EventBus, and — where one needs another's behaviour synchronously — through **ports**.

```
@ryvan/common  (leaf — no @ryvan deps)
    │
    ├── @ryvan/events
    │       │
    │       ├── @ryvan/identity
    │       ├── @ryvan/models
    │       ├── @ryvan/memory
    │       ├── @ryvan/tool-registry
    │       ├── @ryvan/agent-sdk
    │       ├── @ryvan/agent-runtime
    │       ├── @ryvan/policy-engine
    │       ├── @ryvan/workflow-engine
    │       ├── @ryvan/mission-engine
    │       ├── @ryvan/audit
    │       └── @ryvan/connector-sdk
    │
    └── @ryvan/bootstrap  (depends on all packages — wires them together)
```

### Ports

Events are fire-and-forget, so they cannot answer "may I do this?". A package
that needs a synchronous answer declares the interface it wants and lets
bootstrap supply the implementation:

| Port | Declared in | Implemented by |
|------|-------------|----------------|
| `ApprovalGate` | `workflow-engine` | `policy-engine` |
| `WorkflowRunner` | `mission-engine` | `workflow-engine` |
| `PolicyGate` | `mission-engine` | `policy-engine` |
| `ConnectorPolicyGate` | `connector-sdk` | `policy-engine` |

The adapters live in `packages/bootstrap/src/adapters.ts` — the only file in the
platform that knows two domain packages at once, which is exactly where that
knowledge belongs. The rule survives intact: no domain package imports another.

## Service Lifecycle

Every domain package exports a facade class implementing the `Service` interface:

```typescript
interface Service {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Status; // "stopped" | "starting" | "running" | "stopping"
}
```

Services must be started before use and stopped on shutdown. The `@ryvan/bootstrap` package handles this automatically.

## Bootstrap — One-Line Init

Products initialize the entire platform with one call:

```typescript
import { bootstrap } from "@ryvan/bootstrap";

const platform = await bootstrap({
  identity: {
    tokenSecret: process.env.JWT_SECRET!,
    tokenExpiresIn: "24h",
    tokenIssuer: "ryvan-platform",
  },
  models: {
    defaultModel: "claude-haiku-4-5",
  },
});

// Resolve any service from the container
const models = platform.container.resolve<ModelService>("models");
const identity = platform.container.resolve<IdentityService>("identity");

// Graceful shutdown on SIGTERM/SIGINT
platform.enableGracefulShutdown();
```

## Event-Driven Communication

Packages emit typed events. Other packages (or the application) subscribe to them.

```typescript
const events = platform.container.resolve<EventBus>("events");

// Subscribe to events
events.on("task:completed", (event) => {
  console.log("Task done:", event.data);
});

// Events emitted by packages (examples)
// identity:user.created, identity:user.authenticated
// model:called, model:response
// memory:stored, memory:retrieved
// tool:executed, tool:error
// task:created, task:completed, task:failed
// agent:initialized, agent:completed, agent:error
```

## DI Container

All services are registered in a `Container` (dependency injection). Resolve services by name:

```typescript
const container = platform.container;

container.resolve<EventBus>("events");
container.resolve<IdentityService>("identity");
container.resolve<ModelService>("models");
container.resolve<MemoryManager>("memory");
container.resolve<ToolService>("tools");
container.resolve<RuntimeService>("agent-runtime");
container.resolve<AgentService>("agent-sdk");
container.resolve<PolicyService>("policy");
container.resolve<WorkflowService>("workflow");
container.resolve<MissionService>("mission");
container.resolve<AuditService>("audit");
container.resolve<ConnectorService>("connectors");
container.resolve<ILogger>("logger");
```

> `events` is registered on the container but is **not** in the service start
> order — `EventBus` has no lifecycle and is live once constructed.
