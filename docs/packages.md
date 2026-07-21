# Package Reference

## @ryvan/common

**Purpose:** Foundation types, errors, utilities, validation, config, DI container, and logger. Every other package depends on this.

### Key Exports

| Export | Type | Description |
|--------|------|-------------|
| `Container` | Class | DI container — register/resolve services |
| `Logger` | Class | Structured logger with levels and handlers |
| `ConfigManager` | Class | Hierarchical config with dot-path access |
| `generateId(prefix)` | Function | CUID generator — `generateId("task")` → `task_abc123...` |
| `retry(fn, opts)` | Function | Retry with exponential backoff |
| `withTimeout(promise, ms)` | Function | Wrap a promise with a timeout |
| `validateOrThrow(schema, data)` | Function | Zod validation that throws `ValidationError` |
| `EVENTS` | Constant | 60+ canonical event name strings |
| `Service` | Type | Lifecycle interface — `start()`, `stop()`, `status()` |
| `TenantContext` | Type | Multi-tenancy context — `orgId`, `userId`, `roles` |

### Error Hierarchy

All errors extend `RyvanError` with a `code` property:

```
RyvanError
├── ValidationError
├── AuthenticationError
├── AuthorizationError
├── NotFoundError
├── ConflictError
├── TimeoutError
├── RateLimitError
├── ModelError
├── AgentError
├── WorkflowError
└── ... (15 total)
```

---

## @ryvan/events

**Purpose:** Typed event bus — the sole coupling mechanism between packages.

### Usage

```typescript
const bus = new EventBus({ logger });

// Subscribe
const sub = bus.on("task:completed", (event) => {
  // event.type, event.data, event.timestamp, event.source
});

// Subscribe with filter
bus.on("model:response", handler, {
  filter: { source: "models" },
});

// Emit
await bus.emit("task:completed", { taskId: "123" }, { source: "runtime" });

// Unsubscribe
sub.unsubscribe();
```

### Features

- **Middleware pipeline** — `bus.use(middleware)` adds pre-dispatch middleware
- **Dead letter queue** — failed handler events are captured for debugging
- **Event history** — last 1000 events buffered for replay/debugging
- **Filtered subscriptions** — filter by source, correlationId, or metadata

---

## @ryvan/identity

**Purpose:** Authentication, authorization, RBAC, JWT tokens, API keys.

### Usage

```typescript
const identity = new IdentityService(
  { token: { secret: "...", expiresIn: "24h", issuer: "ryvan" } },
  eventBus,
);
await identity.start();

// Create a user
const user = await identity.createUser({
  email: "dev@ryvan.com",
  name: "Dev",
  passwordHash: await hashPassword("password123!"),
  organizationId: orgId,
  roles: ["org:member"],
});

// Authenticate
const result = await identity.authenticateWithPassword("dev@ryvan.com", "password123!");
// result.token — JWT string
// result.user — SafeUser (no passwordHash)

// Check permissions
const allowed = identity.authorize(userId, "read", "projects");
```

### RBAC Hierarchy

```
org:owner > org:admin > org:member
project:admin > project:member > project:viewer
system:admin (wildcard — all permissions)
```

### Security Features

- Bcrypt 72-byte truncation guard
- Rejection sampling for random string generation (no modulo bias)
- O(1) API key lookup via prefix
- JWT claim type validation at runtime
- Minimum 32-char secret enforcement

---

## @ryvan/models

**Purpose:** Multi-provider model routing, cost tracking, usage analytics.

### Usage

```typescript
const models = new ModelService({ defaultModel: "claude-haiku-4-5", eventBus });
await models.start();

// Register a provider
models.registerProvider(anthropicAdapter);

// Chat (routes to best model)
const response = await models.chat(
  [{ role: "user", content: "Hello" }],
  {
    hints: { capability: "chat", privacySensitive: true }, // prefers local models
    context: { tenantId: "org_123", userId: "usr_456" },   // cost tracking
  },
);
```

### Model Routing

The `ModelRouter` selects models based on:

- **Capability match** — does the model support chat/code/vision?
- **Cost optimization** — cheapest model that meets requirements
- **Privacy** — local models preferred when `privacySensitive: true`
- **Fallback** — logs warning and uses default model if no match

### Cost Tracking

Every model call records usage (tokens, cost) per model, tenant, and user. Queryable by date range, model, or tenant.

---

## @ryvan/memory

**Purpose:** Working memory, conversation memory, long-term storage.

### Three Memory Tiers

| Tier | Purpose | Persistence |
|------|---------|-------------|
| Working Memory | Ephemeral key-value (TTL) | Per-agent, in-process |
| Conversation Memory | Turn-based history with auto-trim | Per-session |
| Long-term Memory | Searchable entries with importance scores | Backend-dependent |

### Usage

```typescript
const memory = new MemoryManager({
  backend: new InMemoryBackend(),
  eventBus,
});
await memory.start();

// Store
await memory.store("agent:research", {
  content: "Company X has 500 employees",
  type: "factual",
  importance: 0.8,
  metadata: { source: "discovery" },
});

// Search
const results = await memory.search("agent:research", {
  query: "company size",
  limit: 10,
});

// Conversation memory
const convo = memory.getConversation("session_123");
convo.addTurn({ role: "user", content: "Hello" });
```

### Pluggable Backends

`InMemoryBackend` is the Phase 1 default (50k entry cap, TTL, importance-based eviction). Swap in PostgreSQL/Redis for production by implementing `IMemoryBackend`.

---

## @ryvan/tool-registry

**Purpose:** Tool definition, input validation, execution with middleware.

### Usage

```typescript
const tools = new ToolService({ eventBus, logger });
await tools.start();

// Register a tool
tools.register(
  {
    name: "search_companies",
    description: "Search for companies by criteria",
    parameters: [
      { name: "query", type: "string", required: true, description: "Search query" },
      { name: "limit", type: "number", required: false, default: 10 },
    ],
    timeout: 30000,
  },
  async (context) => {
    const results = await searchCompanies(context.input.query, context.input.limit);
    return { success: true, output: results };
  },
);

// Execute (validates input, runs middleware, enforces timeout)
const result = await tools.execute("search_companies", { query: "AI startups" });

// Convert to LLM function-calling format
const modelTools = tools.toModelFormat();
// [{ name: "search_companies", description: "...", parameters: {...} }]
```

### Validation

The executor validates every input:

- Required parameters must be present
- Types must match (string, number, boolean, object, array)
- Enum values must be in the allowed set
- No unexpected extra parameters
- Default values injected for optional missing params

---

## @ryvan/agent-runtime

**Purpose:** Task queue, scheduler, planner — orchestrates agent execution.

### Usage

```typescript
const runtime = new RuntimeService({
  config: { maxConcurrency: 5, pollIntervalMs: 1000 },
  eventBus,
});
await runtime.start();

// Submit a task
const task = await runtime.submit("Research company Acme Corp", {
  priority: "high",
  agentId: "research",
  timeout: 60000,
  metadata: { companyName: "Acme Corp" },
});

// Task flows: pending → planning → queued → running → completed/failed
```

### Pluggable Planner

Register custom planning strategies:

```typescript
runtime.registerPlannerStrategy({
  name: "research",
  async plan(goal, context) {
    return {
      id: generateId("plan"),
      taskId: "",
      steps: [
        { id: generateId("step"), name: "discover", type: "tool_call", ... },
        { id: generateId("step"), name: "analyze", type: "model_call", ... },
      ],
      strategy: "sequential",
      createdAt: Date.now(),
    };
  },
});
```

### Scheduler Features

- Priority queue (critical > high > normal > low)
- Configurable max concurrency
- Timeout detection per task
- Retry with max attempts
- Graceful shutdown (drains queue, waits for running tasks)

---

## @ryvan/agent-sdk

**Purpose:** Abstract agent base class — the contract for all AI agents.

### Creating an Agent

```typescript
import { RyvanAgent } from "@ryvan/agent-sdk";
import type { AgentExecutionContext } from "@ryvan/agent-sdk";

class ResearchAgent extends RyvanAgent {
  async onExecute(context: AgentExecutionContext): Promise<unknown> {
    // Your agent logic here
    const result = await this.doResearch(context.goal);

    // Use working memory (TTL-enforced)
    this.setWorkingMemory("lastResearch", result);

    // Add to conversation history
    this.addToConversation({
      role: "assistant",
      content: result.summary,
      timestamp: Date.now(),
    });

    return result;
  }
}

// Register with the service
const agentService = container.resolve<AgentService>("agent-sdk");
await agentService.start();

const agent = new ResearchAgent({
  id: "research",
  name: "Research Agent",
  version: "1.0.0",
  model: "claude-haiku-4-5",
  systemPrompt: "You are a research analyst...",
  tools: ["search_companies", "analyze_data"],
  memory: { workingMemoryTTLMs: 300000, conversationMaxTurns: 50 },
});

await agent.initialize();
await agentService.registerAgent(agent);
```

### Agent Lifecycle

```
idle → initializing → ready → executing → reflecting → ready (loop)
                                                      → error
                    → shutdown
```

### Policies

Attach policies to control agent behavior:

```typescript
const agent = new MyAgent({
  // ...
  policies: [{
    name: "rate-limit",
    description: "Max 10 executions per minute",
    enforce: (ctx) => ({ allowed: checkRate(ctx.agentId) }),
  }],
});
```

---

## @ryvan/bootstrap

**Purpose:** One-line platform initialization. Creates, wires, and starts all services.

### Quick Start

```typescript
import { bootstrap } from "@ryvan/bootstrap";

const platform = await bootstrap({
  identity: { tokenSecret: process.env.JWT_SECRET! },
  models: { defaultModel: "claude-haiku-4-5" },
});

platform.enableGracefulShutdown();

// Use services
const models = platform.container.resolve<ModelService>("models");
```

### Lazy Start

If you need to configure services between creation and startup:

```typescript
import { createPlatform } from "@ryvan/bootstrap";

const platform = createPlatform(config);

// Register tools, agents, etc. before starting
const tools = platform.container.resolve<ToolService>("tools");
tools.register(myTool, myHandler);

await platform.start();
```
