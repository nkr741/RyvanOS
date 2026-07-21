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
│   ├── identity/       # Auth, RBAC, JWT, API keys
│   ├── models/         # Multi-provider model routing, cost tracking
│   ├── memory/         # Working, conversation, long-term memory
│   ├── tool-registry/  # Tool definitions, validation, execution
│   ├── agent-runtime/  # Task queue, scheduler, planner
│   ├── agent-sdk/      # Abstract agent base class, collaboration
│   └── bootstrap/      # One-line platform initialization
├── apps/               # Products built on AIOS
│   └── cortex/         # Enterprise intelligence platform
├── docs/               # Developer documentation
├── turbo.json          # Build pipeline configuration
├── pnpm-workspace.yaml # Workspace definition
└── tsconfig.base.json  # Shared TypeScript config
```

## Dependency Graph

All domain packages depend on `common` and `events`. No domain package imports another domain package. They communicate exclusively through the EventBus.

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
    │       └── @ryvan/agent-runtime
    │
    └── @ryvan/bootstrap  (depends on all packages — wires them together)
```

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
container.resolve<ILogger>("logger");
```
