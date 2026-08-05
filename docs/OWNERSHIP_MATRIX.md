# Ownership Matrix

**Status:** Ratified · **Governed by:** Engineering Constitution, Article 2 · **Boundary rulings:** `PLATFORM_BOUNDARY.md` §4
**Purpose:** Exactly one owner for every capability, package, SDK surface and architectural concern. No shared ownership. No unowned surface.

---

## 1 · What ownership means

An owner is accountable for five things. Anything less is a label, not ownership.

| Responsibility | Meaning |
|---|---|
| **Correctness** | Defects belong to the owner regardless of who introduced them |
| **Boundary** | Rejects contributions that violate `PLATFORM_BOUNDARY.md`, including from senior people |
| **Lifecycle** | Proposes state transitions (Constitution Article 17) and honours the deprecation window |
| **Interface** | Approves every change to the public API |
| **Documentation** | The package's README, examples and changelog are current |

**Owners today are stewardships, not teams.** Ryvan is small; every platform stewardship currently maps to one person. The taxonomy is written for the organisation this becomes, so that ownership transfers by editing a table rather than by re-architecting.

**One owner. Always.** *"Both teams maintain it"* means nobody does — and every duplicated capability in software history started as shared ownership of something.

---

## 2 · Owner taxonomy

### Platform stewardships

| Code | Stewardship | Scope |
|---|---|---|
| `@platform-core` | Platform Core | Vocabulary, composition, contracts, the event catalog |
| `@platform-infra` | Platform Infrastructure | Storage, persistence, deployment artefacts |
| `@platform-security` | Platform Security | Identity, secrets, tenancy model |
| `@platform-governance` | Platform Governance | Policy, quotas, budgets, audit |
| `@platform-orchestration` | Platform Orchestration | Mission, workflow, agent runtime |
| `@platform-ai` | AI Runtime | Models, prompts, context, memory, tools, evaluation |
| `@platform-integration` | Platform Integration | Connector contract and implementations |
| `@platform-observability` | Platform Observability | Traces, metrics, cost measurement |
| `@platform-devx` | Developer Platform | SDK, console, testing kit, CLI, certification, CI |
| `@platform-intelligence` | Platform Intelligence | Knowledge graph, search |
| `@architecture` | Architecture | Boundary rulings, constitutional amendments, lifecycle ratification, cross-cutting arbitration |

### Product ownerships

| Code | Product | Domain |
|---|---|---|
| `@cortex` | Cortex | Business intelligence — leads, proposals, competitors, pipeline |
| `@nexusos` | NexusOS | Enterprise operations — payroll, attendance, leave, onboarding |
| `@rynone` | RynOne | Consumer — messaging, delivery, social graph |
| `@qaos` | QAOS | Engineering intelligence — test generation, regression, flake analysis |

---

## 3 · Package ownership

### Existing (20)

| Package | Owner | Domain | Lifecycle |
|---|---|---|:--:|
| `common` | `@platform-core` | Core Platform | Beta |
| `events` | `@platform-core` | Core Platform | Beta |
| `bootstrap` | `@platform-core` | Core Platform | Beta |
| `storage` | `@platform-infra` | Infrastructure | Beta |
| `persistence` | `@platform-infra` | Infrastructure | Beta |
| `identity` | `@platform-security` | Security | Beta |
| `secrets` | `@platform-security` | Security | Beta |
| `policy-engine` | `@platform-governance` | Enterprise Services | Beta |
| `audit` | `@platform-governance` | Enterprise Services | Beta |
| `mission-engine` | `@platform-orchestration` | Enterprise Services | Beta |
| `workflow-engine` | `@platform-orchestration` | Enterprise Services | Beta |
| `agent-runtime` | `@platform-orchestration` | AI Runtime | **Deprecated** |
| `agent-sdk` | `@platform-orchestration` | AI Runtime | **Deprecated** |
| `models` | `@platform-ai` | AI Runtime | Alpha |
| `memory` | `@platform-ai` | AI Runtime | Alpha |
| `tool-registry` | `@platform-ai` | AI Runtime | Alpha |
| `connector-sdk` | `@platform-integration` | Enterprise Services | Beta |
| `resilience` | `@platform-orchestration` | Enterprise Services | Beta |
| `observability` | `@platform-observability` | Observability | Beta |
| `console` | `@platform-devx` | Developer Platform | Alpha |

### Planned

| Package | Owner | Introduced in |
|---|---|---|
| `contracts` | `@platform-core` | Alpha |
| `sdk` | `@platform-devx` | Alpha |
| `agents` | `@platform-orchestration` | Alpha |
| `prompts` | `@platform-ai` | Alpha |
| `context` | `@platform-ai` | Alpha |
| `testing` | `@platform-devx` | Alpha |
| `certification` | `@platform-devx` | Alpha |
| `evaluation` | `@platform-ai` | Beta |
| `notifications` | `@platform-governance` | Beta |
| `knowledge-graph` | `@platform-intelligence` | Beta |
| `connectors/*` | `@platform-integration` | Beta |
| `search` | `@platform-intelligence` | Post-v1 |
| `design-system` | `@platform-devx` | Post-v1 |
| `billing` *(metering)* | `@platform-governance` | Post-v1 |

> **`agents` is owned by Orchestration, not AI Runtime.** The agent *runtime* is an execution concern that sits beside mission and workflow; what an agent *thinks with* — models, prompts, context, memory — is AI Runtime. Splitting it this way keeps the `AgentRunner` port owned by the same stewardship that owns the workflow step invoking it.

---

## 4 · Capability ownership

Capabilities that cross package lines. One owner each.

| Capability | Owner | Notes |
|---|---|---|
| Authentication & sessions | `@platform-security` | |
| Authorisation & RBAC | `@platform-security` | Policy *consumes* roles; it does not own them |
| Organizations & projects | `@platform-security` | |
| **Tenancy model** | `@platform-security` | Was unowned — see §7.4 |
| Secret storage & rotation | `@platform-security` | |
| Policy evaluation | `@platform-governance` | |
| Spend budgets | `@platform-governance` | |
| Volume quotas | `@platform-governance` | |
| Human approvals | `@platform-governance` | |
| Audit ledger & integrity | `@platform-governance` | Never Observability — Constitution Article 15 |
| Mission lifecycle | `@platform-orchestration` | |
| Workflow execution & durability | `@platform-orchestration` | |
| Agent lifecycle | `@platform-orchestration` | Definition → Registry → Versioning → Execution → Evaluation → Retirement |
| Compensation semantics | `@platform-orchestration` | |
| Resilience policy | `@platform-orchestration` | |
| Model routing | `@platform-ai` | |
| **Model provider adapters** | `@platform-ai` | Currently misowned — §7.1 |
| Prompt versioning | `@platform-ai` | |
| Context assembly | `@platform-ai` | |
| Memory | `@platform-ai` | |
| Tool registration & execution | `@platform-ai` | |
| Agent evaluation | `@platform-ai` | Runtime is Orchestration; *quality measurement* is AI Runtime |
| Connector contract | `@platform-integration` | |
| **Connector implementations** | `@platform-integration` | Ruled platform — Boundary §4.1 |
| Tracing & spans | `@platform-observability` | |
| **Cost measurement** | `@platform-observability` | Split from enforcement — §7.5 |
| **Cost enforcement** | `@platform-governance` | |
| Metrics export | `@platform-observability` | |
| Structured logging | `@platform-core` | |
| **Event catalog** | `@platform-core` | Was unowned — §7.2 |
| **Port catalog** | `@architecture` | Individual ports owned by their declaring package (Article 5) |
| Error taxonomy | `@platform-core` | |
| Dependency injection & wiring | `@platform-core` | |
| Storage ports & drivers | `@platform-infra` | |
| Schema migrations | `@platform-infra` | |
| Deployment artefacts | `@platform-infra` | Dockerfile, compose, health probes |
| CI pipeline | `@platform-devx` | |
| SDK surface | `@platform-devx` | |
| Developer Console | `@platform-devx` | |
| Certification Suite | `@platform-devx` | Cannot be owned by anything it certifies |
| Platform test kit | `@platform-devx` | |
| Knowledge graph engine | `@platform-intelligence` | |
| **Core ontology** | `@platform-intelligence` | Only types the platform already owns — Boundary §4.5 |
| **Domain ontology** | *Each product* | Registered at runtime |
| **Lifecycle ratification** | `@architecture` | Was unowned — §7.3 |
| **Boundary rulings** | `@architecture` | |
| Constitutional amendments | `@architecture` | |

---

## 5 · SDK surface ownership

The SDK is owned by `@platform-devx`, but each namespace has a **capability owner** who approves changes to its shape. DevX owns the *contract*; the capability owner owns the *semantics*.

| Namespace | Surface owner | Semantics owner |
|---|---|---|
| `client.missions` | `@platform-devx` | `@platform-orchestration` |
| `client.workflows` | `@platform-devx` | `@platform-orchestration` |
| `client.agents` | `@platform-devx` | `@platform-orchestration` |
| `client.tools` | `@platform-devx` | `@platform-ai` |
| `client.memory` | `@platform-devx` | `@platform-ai` |
| `client.connectors` | `@platform-devx` | `@platform-integration` |
| `client.secrets` | `@platform-devx` | `@platform-security` |
| `client.identity` | `@platform-devx` | `@platform-security` |
| `client.policy` | `@platform-devx` | `@platform-governance` |
| `client.traces` | `@platform-devx` | `@platform-observability` |
| `client.knowledge` | `@platform-devx` | `@platform-intelligence` |

**This is not shared ownership.** Surface and semantics are different decisions: *"should this be on the SDK at all, and in what shape"* versus *"is this behaviour correct."* Both must approve; neither can approve alone.

---

## 6 · Product ownership

| Capability | Owner |
|---|---|
| Leads, proposals, competitor & pipeline intelligence | `@cortex` |
| Payroll, attendance, leave, onboarding, HR compliance | `@nexusos` |
| Messaging, delivery, consumer identity, social graph | `@rynone` |
| Test generation, regression selection, flake analysis | `@qaos` |
| Mission templates | Each product |
| Workflow definitions | Each product |
| Agent definitions and prompts | Each product |
| Policy rule *values* | Each product |
| Domain entity types in the knowledge graph | Each product |
| Vendor→domain mapping above a connector | Each product |
| Product UI, screens, navigation | Each product |
| Domain data models and their migrations | Each product |

---

## 7 · Conflict resolutions *(binding)*

### 7.1 `AnthropicAdapter` — currently in Cortex

**Conflict.** A model provider adapter lives in a product. It passes all five boundary tests, so it is platform capability sitting on the product side.

**Ruling.** Owner is `@platform-ai`. Moves to `@ryvan/models` in **Alpha Stage A**. Cortex's copy is deleted, not deprecated — it has one consumer.

**Consequence.** Products register *credentials*, never *adapters*. A product shipping its own provider adapter is a boundary violation from Alpha onward.

---

### 7.2 Event catalog — unowned

**Conflict.** `common/constants.ts` holds ~90 event constants. Every package adds to it. Nobody owns it, which is how a catalog becomes a junk drawer and events acquire two names for the same thing.

**Ruling.** Owner is `@platform-core`. Adding an event requires their approval. New events must state: who emits it, who consumes it, and whether an existing event already covers the case.

---

### 7.3 Lifecycle state assignment — unowned

**Conflict.** Constitution Article 17 requires every public surface to carry a lifecycle state, but named no authority to grant one. A package owner declaring their own package GA is self-certification.

**Ruling.** The **owner proposes**; `@architecture` **ratifies**. GA requires documentation, tests, and a certification pass. Promoted capabilities additionally require the Two-Consumer Soak (Boundary §5).

---

### 7.4 Tenancy model — unowned

**Conflict.** Tenancy is implemented in `identity`, enforced in `policy-engine`, and *relied upon* by every store — yet no one owns "how isolation works." Constitution Article 19 requires enforcement, not convention, and an unowned enforcement rule is a convention.

**Ruling.** Owner is `@platform-security`. They own the tenant-aware store wrapper, the scoping contract, and the test that proves an unscoped query is inexpressible. Every store must satisfy it; none may opt out.

---

### 7.5 Cost — ambiguous between two stewardships

**Conflict.** Observability measures cost; Governance enforces budgets. Both plausibly "own cost."

**Ruling — split by verb.**
- **Measurement** (attribution, rollups, per-mission cost) → `@platform-observability`
- **Enforcement** (budgets, thresholds, denial) → `@platform-governance`

The contract between them is `recordSpend`. Governance never computes cost; Observability never denies.

---

### 7.6 `apps/cortex` inside the platform repository

**Conflict.** A product in the platform repository. Every product engineer holds commit rights to the platform; every platform change can break a product in the same commit.

**Ruling.** Permitted until the platform publishes versioned packages (Milestone 6). **`@cortex` owns the directory; `@architecture` owns the extraction decision.**

Until extraction, Cortex is bound as if external:
- imports `@ryvan/sdk` and `@ryvan/contracts` only,
- receives no platform change made specifically for it,
- runs the Certification Suite in CI like any other product.

---

### 7.7 `agent-runtime` and `agent-sdk` — orphaned

**Conflict.** Two packages with zero consumers, holding duplicate planner, policy and memory concepts.

**Ruling.** Owner is `@platform-orchestration`, lifecycle **Deprecated** effective now. In Alpha Stage B: `ExecutionPlan` is deleted, `agent-sdk` is retired, and the queue and scheduler are kept as a *driver* for workflow runs. Zero consumers means zero deprecation window.

---

### 7.8 Documentation ownership

| Document | Owner | Change requires |
|---|---|---|
| `ENGINEERING_CONSTITUTION.md` | `@architecture` | Amendment (Article 20) |
| `PLATFORM_BOUNDARY.md` | `@architecture` | Amendment |
| `OWNERSHIP_MATRIX.md` | `@architecture` | Amendment |
| `ARCHITECTURE.md` | `@architecture` | Review |
| `deployment.md`, `operations.md` | `@platform-infra` | Review |
| `packages.md` | Each package owner, per section | Review |
| `SDK_GUIDE.md` | `@platform-devx` | Review |
| `ADR/*` | Proposer, ratified by `@architecture` | **Immutable once ratified** |

---

## 8 · CODEOWNERS mapping

The target `.github/CODEOWNERS`, to be created when stewardships map to more than one person.

```
# Architecture — governance documents require ratification
/docs/ENGINEERING_CONSTITUTION.md   @architecture
/docs/PLATFORM_BOUNDARY.md          @architecture
/docs/OWNERSHIP_MATRIX.md           @architecture
/docs/ARCHITECTURE.md               @architecture
/docs/ADR/                          @architecture

# Core Platform — highest blast radius
/packages/common/                   @platform-core
/packages/events/                   @platform-core
/packages/bootstrap/                @platform-core
/packages/contracts/                @platform-core

# Infrastructure
/packages/storage/                  @platform-infra
/packages/persistence/              @platform-infra
/Dockerfile                         @platform-infra
/docker-compose.yml                 @platform-infra
/scripts/migrate.mjs                @platform-infra
/scripts/serve.mjs                  @platform-infra
/scripts/healthcheck.mjs            @platform-infra

# Security
/packages/identity/                 @platform-security
/packages/secrets/                  @platform-security

# Governance
/packages/policy-engine/            @platform-governance
/packages/audit/                    @platform-governance
/packages/notifications/            @platform-governance

# Orchestration
/packages/mission-engine/           @platform-orchestration
/packages/workflow-engine/          @platform-orchestration
/packages/agents/                   @platform-orchestration
/packages/resilience/               @platform-orchestration
/packages/agent-runtime/            @platform-orchestration
/packages/agent-sdk/                @platform-orchestration

# AI Runtime
/packages/models/                   @platform-ai
/packages/prompts/                  @platform-ai
/packages/context/                  @platform-ai
/packages/memory/                   @platform-ai
/packages/tool-registry/            @platform-ai
/packages/evaluation/               @platform-ai

# Integration
/packages/connector-sdk/            @platform-integration
/packages/connectors/               @platform-integration

# Observability
/packages/observability/            @platform-observability

# Developer Platform
/packages/sdk/                      @platform-devx
/packages/console/                  @platform-devx
/packages/testing/                  @platform-devx
/packages/certification/            @platform-devx
/.github/workflows/                 @platform-devx
/scripts/smoke.mjs                  @platform-devx

# Intelligence
/packages/knowledge-graph/          @platform-intelligence
/packages/search/                   @platform-intelligence

# Products
/apps/cortex/                       @cortex
/apps/nexusos/                      @nexusos
/apps/rynone/                       @rynone
/apps/qaos/                         @qaos

# Two approvals: SDK surface AND capability semantics (§5)
/packages/sdk/src/missions.ts       @platform-devx @platform-orchestration
/packages/sdk/src/agents.ts         @platform-devx @platform-orchestration
/packages/sdk/src/tools.ts          @platform-devx @platform-ai
/packages/sdk/src/memory.ts         @platform-devx @platform-ai
/packages/sdk/src/secrets.ts        @platform-devx @platform-security
/packages/sdk/src/identity.ts       @platform-devx @platform-security
/packages/sdk/src/policy.ts         @platform-devx @platform-governance
/packages/sdk/src/connectors.ts     @platform-devx @platform-integration
/packages/sdk/src/traces.ts         @platform-devx @platform-observability
/packages/sdk/src/knowledge.ts      @platform-devx @platform-intelligence
```

> The dual entries under `/packages/sdk/` are the **only** place two owners appear, and they are not shared ownership — they are two distinct approvals over two distinct decisions (§5).

---

## 9 · Validation

### 9.1 Completeness — is anything unowned?

| Surface class | Count | Owned | Unowned |
|---|:--:|:--:|:--:|
| Existing packages | 20 | 20 | 0 |
| Planned packages | 14 | 14 | 0 |
| Cross-cutting capabilities | 45 | 45 | 0 |
| SDK namespaces | 11 | 11 | 0 |
| Architectural concerns | 8 | 8 | 0 |
| Documents | 8 | 8 | 0 |
| Repository artefacts (CI, Docker, scripts) | 7 | 7 | 0 |
| **Total** | **113** | **113** | **0** |

**Five surfaces were unowned before this document** and are resolved in §7: model provider adapters (7.1), the event catalog (7.2), lifecycle ratification (7.3), the tenancy model (7.4), and cost (7.5).

### 9.2 Uniqueness — is anything double-owned?

| Check | Result |
|---|---|
| A package with two owners | **0** |
| A capability with two owners | **0** |
| An SDK namespace with two *surface* owners | **0** |
| Ambiguous ownership ("both", "shared", "TBD") | **0** |
| Capability owned by a product and the platform | **0** *(7.1 resolves the only instance)* |

### 9.3 Structural invariants

| Invariant | Holds |
|---|:--:|
| Every package maps to exactly one stewardship | ✅ |
| Every stewardship maps to exactly one domain (§2 / Boundary §2) | ✅ |
| No product owns a platform capability | ✅ *(after 7.1)* |
| No platform stewardship owns a domain noun | ✅ |
| The Certification Suite is not owned by anything it certifies | ✅ |
| Audit is owned by Governance, not Observability | ✅ |
| Cost measurement and enforcement have different owners | ✅ |

---

## 10 · Transfer, escalation, and vacancy

**Transfer.** Ownership moves by editing this document. The new owner must accept in writing; a transfer without an accepting owner is an abandonment, not a transfer.

**Escalation.** A dispute between two stewardships goes to `@architecture`, whose ruling is recorded in `PLATFORM_BOUNDARY.md` §4 if it is a boundary question, or here if it is an ownership question. Either way it is written down, so the same dispute is not had twice.

**Vacancy.** A capability whose owner leaves reverts to `@architecture` **within one working day**, and must be reassigned within one sprint. An unowned capability is a defect with a countdown, not a steady state.

**Splitting.** When a package grows past what one stewardship can hold, it splits along a port boundary — never down the middle of a capability. If no port boundary exists, the package is not ready to split; it needs one first.

---

*Phase 3 of the RyvanOS v1.0 foundation.*
*Next: `ARCHITECTURE.md` · tag Foundation v1 · freeze governance · begin Alpha.*
