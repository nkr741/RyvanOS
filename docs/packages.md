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

---

## @ryvan/policy-engine

**Purpose:** Decides whether an action may proceed — rules, spend budgets, and human approval gates. Called before anything consequential happens.

> Not to be confused with `@ryvan/identity`. Identity answers *"who is this and what are they allowed to hold?"*. Policy answers *"may this action happen right now, and can we afford it?"*. Policy never stores users or roles; callers pass the roles identity already resolved.

### Decision procedure

Every matching enabled rule is collected, the highest `priority` wins, and ties within that priority go to the stronger effect — `deny` > `require_approval` > `allow`. A deny can never be silently outvoted by an allow written at the same level. When no rule matches, the configured `defaultEffect` applies (`allow` unless set).

Budgets are a hard ceiling checked *before* rules: an exceeded budget denies regardless of what any rule says.

```typescript
const policy = platform.container.resolve<PolicyService>("policy");

const decision = await policy.enforce({
  action: "connector:sap:createInvoice",
  resource: "connector:sap",
  subject: { userId, orgId, roles: ["org:member"] },
  estimatedCostUsd: 0.4,
});

if (decision.effect === "require_approval") {
  // decision.approvalId is now pending a human
}
```

### Key exports

| Export | Description |
|--------|-------------|
| `PolicyService` | Facade — `enforce()`, `requestApproval()`, `grantApproval()`, `recordSpend()` |
| `PolicyEngine` | Rule store and decision procedure |
| `BudgetGuard` | Rolling-window spend ceilings by org/user/agent |
| `ApprovalStore` | Approval lifecycle with TTL expiry |

---

## @ryvan/workflow-engine

**Purpose:** Executes a step graph durably. This is what turns a plan into work actually being done.

### Model

Ordering comes from `dependsOn`, so **parallelism is a property of the graph**, not a step type — independent steps run concurrently up to `maxStepConcurrency`. Step kinds describe what a step *does*:

| Kind | Behaviour |
|------|-----------|
| `action` | Invokes a registered handler |
| `conditional` | Evaluates a predicate; skips all dependents when false |
| `approval` | Suspends the run until an approval is decided |
| `schedule` | Suspends until a delay elapses or an absolute time arrives |
| `event` | Suspends until a named event fires on the bus |

Retries, timeouts, and compensation are **modifiers** on a step (`retry`, `timeoutMs`, `compensate`), not kinds — because that is what they are.

A run that suspends is persisted and returns; `resume()` picks it back up, so a run survives anything the store survives. When a step fails fatally, completed steps compensate in reverse completion order.

```typescript
const workflow = platform.container.resolve<WorkflowService>("workflow");

workflow.registerHandler("charge", async (ctx) => {
  return billing.charge(ctx.stepInput.amount, ctx.outputs.customer);
});

workflow.register({
  id: "onboard", name: "Onboard customer", version: "1.0.0",
  steps: [
    { id: "customer", name: "Create", kind: "action", handler: "createCustomer" },
    { id: "charge", name: "Charge", kind: "action", handler: "charge",
      dependsOn: ["customer"], compensate: "refund",
      retry: { maxAttempts: 3 }, timeoutMs: 10_000 },
  ],
});
```

> Step outputs are persisted, so they must be structured-cloneable.

---

## @ryvan/mission-engine

**Purpose:** The unit of intent above a workflow. A mission is checked against policy, planned into a workflow, executed, and finalised — in that order, always.

Products describe *what* they want done; the mission engine decides whether it may proceed and what carries it out.

```typescript
const mission = platform.container.resolve<MissionService>("mission");

const run = await mission.launch({
  type: "payroll.run",
  goal: "Run July payroll",
  input: { month: 7 },
  subject: { userId, orgId, roles },
  estimatedCostUsd: 12.5,
});

// run.status: "completed" | "running" | "awaiting_approval" | "failed"
```

Planning defaults to `TemplateMissionPlanner`, a deterministic mission-type → workflow mapping. That is intentional: most enterprise missions are known shapes, and a deterministic mapping is auditable. A product needing generated plans implements the `MissionPlanner` port instead.

---

## @ryvan/audit

**Purpose:** Records what the platform did, in a form that stands up as evidence.

Each entry commits to its predecessor's hash, so a single altered or removed record is detectable by `verify()`. That is what makes the log evidence rather than just history.

The service **subscribes to the event bus** rather than requiring callers to log explicitly — an audit trail that depends on every author remembering to call it is one that has gaps.

```typescript
const audit = platform.container.resolve<AuditService>("audit");

const entries = await audit.query({ orgId: "acme", since: Date.now() - 86_400_000 });
const { valid, brokenAt } = await audit.verify();
```

A failing audit write never takes down the thing being audited.

---

## @ryvan/connector-sdk

**Purpose:** One contract every external integration implements — Oracle, SAP, Workday, Slack, Stripe alike. Products call `execute()` and never learn which vendor is behind it.

**This package ships no vendor implementations on purpose.** The contract is the reusable part; each vendor is a separate, small piece of work on top of it.

```typescript
class SalesforceConnector extends BaseConnector {
  readonly id = "salesforce";
  readonly vendor = "salesforce";
  readonly version = "1.0.0";

  protected operations() {
    return [
      { name: "getAccount" },
      { name: "createOpportunity", mutates: true,
        requiredPermission: "connector:salesforce:write" },
    ];
  }

  protected async doConnect(config) { /* open the session */ }
  protected async doExecute(operation, input) { /* one call */ }
}

await connectors.register(new SalesforceConnector(), config);
const result = await connectors.execute("salesforce", "getAccount", { id });
```

`BaseConnector` handles connection state, operation validation, timeouts, latency measurement, retry classification, and turning a thrown error into a `ConnectorResult`. Subclasses supply three things: the operations they expose, how to connect, and how to perform one call.

Operations marked `mutates: true` are checked against policy before the vendor is called — a denied write is never sent.
