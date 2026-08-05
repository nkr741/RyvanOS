# RyvanOS Architecture

**Status:** Architecture of record · **Foundation v1**
**Governed by:** [`ENGINEERING_CONSTITUTION.md`](./ENGINEERING_CONSTITUTION.md) · [`PLATFORM_BOUNDARY.md`](./PLATFORM_BOUNDARY.md) · [`OWNERSHIP_MATRIX.md`](./OWNERSHIP_MATRIX.md)

> This document describes **what is built and how it fits together**. It changes as the platform changes. The three documents above describe **how we decide**, and change only by amendment.
>
> This is the *only* architecture document. If you find another, one of them is wrong.

---

## 1 · What RyvanOS is

**An Enterprise Application Platform. AI is a first-class capability of the platform, not its sole identity.**

Identity, workflows, policy, events, storage, observability and governance are valuable with or without a language model. Building around them — and treating AI as a capability that runs *on* that foundation rather than *as* it — is what keeps the platform durable while the AI field churns.

Products are built on RyvanOS and must be able to share it **without knowing about each other**.

```
Cortex      Business intelligence
NexusOS     Enterprise operations
RynOne      Consumer applications
QAOS        Engineering intelligence
```

RyvanOS contains **zero product logic**. See `PLATFORM_BOUNDARY.md` for the decision procedure.

---

## 2 · The layer model

```
┌──────────────────────────────────────────────────────────────┐
│  PRODUCTS         Cortex · NexusOS · RynOne · QAOS           │
└───────────────────────────┬──────────────────────────────────┘
                            │  imports ONLY sdk + contracts
┌───────────────────────────▼──────────────────────────────────┐
│  PRODUCT INTERFACE   sdk · contracts · testing · certification│
│                      The stability contract and deprecation   │
│                      boundary. Article 3.                     │
└───────────────────────────┬──────────────────────────────────┘
┌───────────────────────────▼──────────────────────────────────┐
│  ORCHESTRATION    mission-engine · workflow-engine · agents   │
│                   "should this happen, and what carries it?"  │
├──────────────────────────────────────────────────────────────┤
│  GOVERNANCE       policy-engine · identity · secrets          │
│                   "is it permitted, affordable, in quota?"    │
├──────────────────────────────────────────────────────────────┤
│  AI RUNTIME       models · prompts · context · memory ·       │
│                   tool-registry · evaluation                  │
├──────────────────────────────────────────────────────────────┤
│  INTEGRATION      connector-sdk · connectors/*                │
├──────────────────────────────────────────────────────────────┤
│  RESILIENCE       resilience                                  │
├──────────────────────────────────────────────────────────────┤
│  INTELLIGENCE     knowledge-graph · search                    │
├──────────────────────────────────────────────────────────────┤
│  EVIDENCE         audit  (compliance — never sampled)         │
│                   observability  (may sample, drop, expire)   │
├──────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE   storage · persistence                       │
├──────────────────────────────────────────────────────────────┤
│  CORE             common · events · bootstrap                 │
└──────────────────────────────────────────────────────────────┘
```

**Audit sits beside observability but is not part of it.** Constitution Article 15: evidence and observability have opposite requirements for retention, integrity and access. They never share a storage policy.

---

## 3 · Package register

Lifecycle states per Constitution Article 17. Owners per `OWNERSHIP_MATRIX.md`.

| Package | Layer | Owner | Lifecycle |
|---|---|---|:--:|
| `common` | Core | `@platform-core` | Beta |
| `events` | Core | `@platform-core` | Beta |
| `bootstrap` | Core | `@platform-core` | Beta |
| `contracts` | Product Interface | `@platform-core` | *planned* |
| `sdk` | Product Interface | `@platform-devx` | *planned* |
| `testing` | Product Interface | `@platform-devx` | *planned* |
| `certification` | Product Interface | `@platform-devx` | *planned* |
| `storage` | Infrastructure | `@platform-infra` | Beta |
| `persistence` | Infrastructure | `@platform-infra` | Beta |
| `identity` | Governance | `@platform-security` | Beta |
| `secrets` | Governance | `@platform-security` | Beta |
| `policy-engine` | Governance | `@platform-governance` | Beta |
| `mission-engine` | Orchestration | `@platform-orchestration` | Beta |
| `workflow-engine` | Orchestration | `@platform-orchestration` | Beta |
| `agents` | Orchestration | `@platform-orchestration` | *planned* |
| `resilience` | Resilience | `@platform-orchestration` | Beta |
| `models` | AI Runtime | `@platform-ai` | Alpha |
| `prompts` | AI Runtime | `@platform-ai` | *planned* |
| `context` | AI Runtime | `@platform-ai` | *planned* |
| `memory` | AI Runtime | `@platform-ai` | Alpha |
| `tool-registry` | AI Runtime | `@platform-ai` | Alpha |
| `evaluation` | AI Runtime | `@platform-ai` | *planned* |
| `connector-sdk` | Integration | `@platform-integration` | Beta |
| `connectors/*` | Integration | `@platform-integration` | *planned* |
| `audit` | Evidence | `@platform-governance` | Beta |
| `observability` | Evidence | `@platform-observability` | Beta |
| `console` | Developer Platform | `@platform-devx` | Alpha |
| `knowledge-graph` | Intelligence | `@platform-intelligence` | *planned* |
| `agent-runtime` | — | `@platform-orchestration` | **Deprecated** |
| `agent-sdk` | — | `@platform-orchestration` | **Deprecated** |

**`agent-runtime` and `agent-sdk` are deprecated.** They are an execution model that predates `workflow-engine`, have zero consumers, and hold duplicate planner, policy and memory concepts. Retired in Alpha Stage B: `ExecutionPlan` is deleted; the queue and scheduler are kept as a *driver* for workflow runs.

---

## 4 · Dependency rules

**Article 4:** a domain package may import `@ryvan/common` and `@ryvan/events`. Nothing else internal.

**Article 3:** a product may import `@ryvan/sdk` and `@ryvan/contracts`. Nothing else.

```
common  (leaf — imports nothing internal)
   │
   └── events
         │
         ├── identity · secrets · policy-engine
         ├── mission-engine · workflow-engine · agents · resilience
         ├── models · prompts · context · memory · tool-registry · evaluation
         ├── connector-sdk · audit · observability · storage
         ├── knowledge-graph · console
         │
         ├── persistence     (storage + the domain packages it persists)
         ├── sdk             (the capabilities it exposes)
         └── bootstrap       (everything — the composition root)
```

**Four integration packages** may know more than one domain package, because integration is their purpose: `bootstrap`, `persistence`, `sdk`, `console` (ports only). No fifth joins without a constitutional amendment.

---

## 5 · Ports

Events are fire-and-forget and cannot answer *"may I?"*. A package needing a synchronous answer declares the interface **it** owns (Article 5); the composition root supplies the implementation.

| Port | Declared by | Implemented by |
|---|---|---|
| `ApprovalGate` | workflow-engine | policy-engine |
| `WorkflowRunner` | mission-engine | workflow-engine |
| `PolicyGate` | mission-engine | policy-engine |
| `AgentRunner` | workflow-engine | agents |
| `ConnectorPolicyGate` | connector-sdk | policy-engine |
| `ResilienceGate` | connector-sdk | resilience |
| `ConsoleSources` | console | many |
| `CounterStore` | policy-engine | storage, via persistence |
| `ContextAssembler` | agents | context |
| `ModelProviderAdapter` | models | provider adapters |
| `MissionPlanner` | mission-engine | products, or platform default |
| Eight store ports | their own packages | persistence |

Adapters live only in `bootstrap/src/adapters.ts` and `console-sources.ts`. That surface is roughly 200 lines and should stay readable in one sitting — it is the property that makes this architecture viable at scale.

---

## 6 · Runtime flow

```
Product → client.missions.launch()          via SDK only
   │
   ├─ Policy      rules → budgets → quotas → approval     ✅
   ├─ Planner     mission type → workflow                 ✅ deterministic
   ├─ Workflow    durable DAG                             ✅
   ├─ Agent       AgentRunner port                        🔨 Alpha
   ├─ Context     assembled from memory + input           🔨 Alpha
   ├─ Prompt      resolved from a versioned template      🔨 Alpha
   ├─ Model       routed, costed, attributed              🔨 Alpha (adapter)
   ├─ Tool        permission-gated                        🔨 Alpha (gate)
   ├─ Memory      written, recalled next turn             🔨 Alpha (wiring)
   ├─ Audit       hash-chained, agent version recorded    ✅
   └─ Observability  full span tree with cost             ✅
```

**Nine of fourteen stages work today.** The Alpha closes the remaining five. Its exit criterion is that this diagram contains no 🔨.

---

## 7 · Start order

```
identity → secrets → policy → resilience → observability → audit →
models → memory → tools → connectors → workflow →
agents → agent-sdk → agent-runtime → mission → console
```

Storage drivers connect **before** any service and disconnect **after** all of them. Audit and observability start early so they capture what follows. Mission starts last because it drives everything below it. **The console starts last of all** — an inspector must never be why the platform fails to come up.

`events` is registered on the container but has no lifecycle; `EventBus` is live once constructed.

---

## 8 · Multi-tenancy

| Concern | Where | Owner |
|---|---|---|
| Organization → Project | `identity` | `@platform-security` |
| Roles and permissions | `identity` — hierarchical, org/project scoped | `@platform-security` |
| API keys | `identity` | `@platform-security` |
| Credentials | `secrets` — AES-256-GCM, tenant-scoped | `@platform-security` |
| Spend ceilings | `policy-engine` `BudgetGuard` | `@platform-governance` |
| Volume ceilings | `policy-engine` `QuotaGuard` | `@platform-governance` |
| **Isolation enforcement** | Tenant-aware store wrapper | `@platform-security` |

**There is no Workspace entity.** `Project` is that layer. Two names for one concept would force every store, filter and permission check to understand a distinction that does not exist.

**Isolation is enforced, not assumed** (Article 19). A query omitting its tenant scope must be impossible to express. *This is not yet true — it is the Beta gate.*

---

## 9 · Event model

`correlationId` **is** the trace id. A mission generates one and passes it to its workflow, so everything beneath one mission shares a trace. This is why observability assembles a full span tree from events alone, with no service instrumented for it.

Event names come from `EVENTS` in `common` — never string literals. The catalog is owned by `@platform-core`; adding an event requires stating who emits it, who consumes it, and why no existing event covers the case.

---

## 10 · Persistence

Everything that would surprise a user by disappearing is durable (Article 14): missions, workflow runs, approvals, audit entries, identity, secrets, traces, dead letters, memory.

`storage.postgresUrl` is the single switch. Omit it and the platform runs entirely in memory — correct for tests, data loss in production, and logged loudly as such.

In-memory and durable implementations are held to identical behaviour by a shared **conformance suite**. That suite is the only reason "swap the driver" is a safe claim rather than a hopeful one.

---

## 11 · Deployment

| Artefact | Purpose |
|---|---|
| `Dockerfile` | Multi-stage; runtime carries no compiler, no test runner, no source; non-root |
| `docker-compose.yml` | Platform + Postgres/pgvector + Redis |
| `scripts/serve.mjs` | Standalone entry, environment-configured |
| `scripts/migrate.mjs` | pgvector extension and hot-path indexes |
| `scripts/smoke.mjs` | Boots built output under plain Node — catches what bundlers hide |
| `/healthz` `/readyz` | Unauthenticated, separate port, so a load balancer never needs the console token |

Liveness and readiness are deliberately different: restarting a pod because Postgres blipped turns a dependency outage into an availability outage.

---

## 12 · Known gaps

Recorded here so the architecture of record is honest about itself.

| Gap | Impact | Closes in |
|---|---|---|
| Agents not connected to workflows | The namesake capability is absent | **Alpha** |
| No model provider adapter in the platform | Every product reimplements it | **Alpha Stage A** |
| No prompt, context, or evaluation packages | Prompts unversioned; quality unmeasurable | Alpha / Beta |
| Memory unused by the runtime | Agents restart every turn | **Alpha** |
| In-process event bus | Caps the platform at one replica | Beta |
| Tenant isolation by convention | One missed filter is a cross-tenant leak | **Beta gate** |
| Seven packages with zero tests | Includes RBAC inheritance and scheduler drain | Alpha / Beta |
| No metrics export | Observability is an island | Beta |
| Docker image unverified end-to-end | Build stage verified; runtime stage not | Alpha |

---

## 13 · Reading order

**Building a product?** `PLATFORM_BOUNDARY.md` → `SDK_GUIDE.md` → `getting-started.md`
**Building the platform?** `ENGINEERING_CONSTITUTION.md` → this document → `packages.md`
**Operating it?** `deployment.md` → `console` → `/readyz`
**Deciding something?** `PLATFORM_BOUNDARY.md` §1, then `OWNERSHIP_MATRIX.md`

---

*Phase 4 of the RyvanOS v1.0 foundation. Governance is frozen at Foundation v1.*
*Next: Alpha execution — Stage A.*
