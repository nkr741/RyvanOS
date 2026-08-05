# Platform Boundary

**Status:** Ratified · **Governed by:** Engineering Constitution, Articles 1–3
**Purpose:** To answer *"RyvanOS or product?"* mechanically, without debate.

---

## How to use this document

You have a capability to build. Run **The Procedure** (§1). It returns exactly one answer.

If it returns `AMBIGUOUS`, consult **Hard Cases** (§4). If your case is not there, follow **§7 Escalation** — and the resolution is added to §4 so the same question is never asked twice.

Do not read this document end to end to answer one question. Sixty seconds in §1 should be enough.

---

# 1 · The Procedure

Run the tests **in order**. The first test that returns a verdict is the answer.

### Test 1 — Domain Noun *(fastest disqualifier)*

> Write the capability's public API in one sentence. Does it require a domain noun?

**Domain nouns:** lead, candidate, employee, payroll, attendance, rider, order, invoice, ticket, test case, message thread, campaign, shipment, patient, contract.

**Platform nouns:** mission, workflow, step, agent, policy, quota, connector, span, tenant, secret, entity, document.

| Result | Verdict |
|---|---|
| Requires a domain noun | **PRODUCT** — stop here |
| Does not | Continue to Test 2 |

> *"Stores encrypted credentials scoped to a tenant."* → no domain noun → continue.
> *"Calculates statutory payroll deductions."* → payroll → **PRODUCT**.

---

### Test 2 — Substitution

> Replace your product's name with a competitor's. Does the capability still make sense?

| Result | Verdict |
|---|---|
| *"Would Workday need this?"* → **yes** | Continue to Test 3 |
| *"Would Workday need this?"* → **no** | **PRODUCT** |

This test exists because Test 1 is defeated by careful vocabulary. Anyone can rename `PayrollApprovalService` to `ApprovalService`. They cannot make "approve a payroll run against Indian statutory rules" sound like something Workday's platform team would build.

---

### Test 3 — Second Consumer

> Name a **second** product that would independently need this. Not "might one day" — name it and state what it would use it for.

| Result | Verdict |
|---|---|
| Two or more named, with stated uses | Continue to Test 4 |
| Exactly one | **PRODUCT NOW, PROMOTABLE LATER** — see §5 |
| Cannot name any | **PRODUCT** — you are building speculatively |

"All products will eventually need it" is not a second consumer. Name it or build it in the product.

---

### Test 4 — Mutual Ignorance

> If two products both use this, must either learn anything about the other's data model, vocabulary, or assumptions?

| Result | Verdict |
|---|---|
| **No** — they can share it while remaining strangers | Continue to Test 5 |
| **Yes** | **PRODUCT** — this is a shared library, not a platform capability |

This is the load-bearing test and the one most often skipped. A capability that helps four products but requires each to understand the others' schema has not reduced coupling; it has centralised it.

> *A `KnowledgeGraph` storing typed entities and edges* → products register their own types → **strangers** → continue.
> *A `CustomerService` where "customer" means a Cortex lead to one caller and a NexusOS employer to another* → they must agree on a shared definition → **PRODUCT**.

---

### Test 5 — Engine or Content

> Is this the **engine** (mechanism, contract, runtime) or the **content** (configuration, definitions, values that flow through it)?

| Result | Verdict |
|---|---|
| Engine, contract, or runtime | **PLATFORM** |
| Content, configuration, or values | **PRODUCT** |

| Engine → Platform | Content → Product |
|---|---|
| `WorkflowRegistry` | The `payroll.run` workflow definition |
| `PolicyEngine` | The rule *"payroll is frozen at month-end"* |
| `AgentRegistry` + runtime | The `payroll-summariser` agent definition |
| `PromptRegistry` | The prompt text |
| `Connector` contract + `BaseConnector` | The mapping from a vendor's `Account` to your domain |
| `QuotaGuard` | *"Free tier gets 100 missions/month"* |
| `KnowledgeGraph` engine | The `Employee` entity type |

---

### Result

Passing all five tests → **PLATFORM**. Any failure → **PRODUCT**, at the test that failed.

Record the answer and the failing test in your PR description. That sentence is the whole audit trail this decision needs.

---

# 2 · The Eight Domains

Every platform capability belongs to exactly one.

| Domain | Owns | Definition |
|---|---|---|
| **Core Platform** | `common`, `events`, `bootstrap`, `contracts` | Vocabulary and composition. Cannot be replaced without replacing the platform |
| **Infrastructure** | `storage`, `persistence` | Where state lives and how it moves |
| **AI Runtime** | `models`, `agents`, `prompts`, `context`, `memory`, `tool-registry`, `evaluation` | Anything that reasons, remembers, or calls a model |
| **Developer Platform** | `sdk`, `console`, `testing`, CLI | How a human or a product builds on and operates the platform |
| **Security** | `identity`, `secrets` | Who may do what; what is kept secret |
| **Observability** | `observability` | Why was it slow. May sample, drop, expire |
| **Enterprise Services** | `policy-engine`, `workflow-engine`, `mission-engine`, `resilience`, `connector-sdk`, `connectors/*`, `audit`, `notifications` | Governance, durability and integration that enterprises pay for |
| **Intelligence** | `knowledge-graph`, `search` | Cross-product knowledge |

**`audit` is Enterprise Services, not Observability.** Per Constitution Article 15, evidence and observability have opposite requirements for retention, integrity and access. Filing them together eventually leads someone to add sampling to the audit ledger.

---

# 3 · Worked Examples

## Platform

| Capability | Why |
|---|---|
| Encrypted secret storage | No domain noun · Workday needs it · all four products · strangers · engine |
| Workflow execution engine | Passes all five |
| Hash-chained audit ledger | Passes all five |
| Circuit breakers | Passes all five |
| Model provider adapters | An Anthropic adapter is identical for every product |
| Connector contract **and implementations** | See §4.1 — contested, ruled platform |
| Tenant-scoped quotas | Volume ceilings are tier mechanics, not domain logic |
| Trace assembly and cost attribution | Cost per mission is a platform question |
| Notification **delivery** | Sending a message via email/Slack/webhook is domain-free |
| Design system primitives | Button, Table, Dialog, tokens — no domain nouns |

## Product

| Capability | Fails at |
|---|---|
| Payroll deduction calculation | Test 1 — payroll |
| Lead scoring | Test 1 — lead |
| Candidate ranking | Test 1 — candidate |
| Rider dispatch optimisation | Test 1 — rider |
| Flaky test detection | Test 1 — test |
| `EmployeeService` | Test 1 — employee |
| An "AttendanceWorkflow" package | Test 2 — Workday would not use *your* attendance workflow |
| A `CustomerService` shared by Cortex and NexusOS | Test 4 — requires an agreed definition of "customer" |
| The `payroll.run` mission template | Test 5 — content |
| Notification **templates and copy** | Test 5 — content |
| Product screens and navigation | Test 5 — content |

---

# 4 · Hard Cases *(rulings — binding)*

### 4.1 Connector implementations → **PLATFORM**

*Contested.* A Salesforce connector is arguably product work, since one product wants it first.

**Ruling: platform.** It passes all five tests — a Salesforce connector is identical for every product, and the alternative fails Test 4 decisively: if Cortex writes it, NexusOS inherits Cortex's assumptions about what an "Account" means.

**Boundary within the boundary:** the connector exposes the *vendor's* model (`getAccount`, `createOpportunity`). Translating that into a product's domain is a mapping layer **in the product**.

> `packages/connectors/salesforce` → platform.
> `apps/cortex/src/integrations/salesforce-mapping.ts` → product.

---

### 4.2 Mission templates and workflow definitions → **PRODUCT**

The registries are platform; the definitions are content (Test 5). `payroll.run` fails Test 1 anyway.

**Exception:** a template needed by two or more products *and* free of domain nouns — a generic `document.summarise` — may be promoted via §5. Rare. Treat with suspicion.

---

### 4.3 Agent definitions → **PRODUCT** · Agent runtime → **PLATFORM**

The registry, versioning, execution, evaluation and retirement are platform. A specific agent is content.

**The tell:** if the agent's prompt mentions a domain noun, it is product-owned. Almost all will.

---

### 4.4 Prompts → **PRODUCT** · Prompt registry → **PLATFORM**

Versioning, storage, substitution and resolution are platform. The text is content.

---

### 4.5 Knowledge graph → **PLATFORM (engine)** · Ontology → **SPLIT**

The engine — entities, edges, traversal, query — is platform.

The **ontology splits**, and this is the subtlest ruling here:

| Entity types | Owner | Why |
|---|---|---|
| `Organization`, `User`, `Project`, `Mission`, `Workflow`, `Agent`, `Document`, `Connector` | **Platform** | The platform already owns these concepts. Every product means the same thing by them |
| `Employee`, `Lead`, `Rider`, `TestCase`, `Invoice` | **Product** | Registered by the product at runtime |

**The rule:** the platform ships the entity types **it already owns elsewhere**. Everything else is registered. A platform-defined `Employee` would fail Test 1, and inventing one to be "helpful" is the exact mechanism by which platforms become one product's schema.

---

### 4.6 Search → **PLATFORM (engine)** · Indexes → **PRODUCT**

Indexing, querying and ranking are platform. What gets indexed, and how results are scored for a domain, is product.

---

### 4.7 Billing → **SPLIT**

| Concern | Owner |
|---|---|
| Metering — counting missions, tokens, storage, calls | **Platform** (it is already counting for quotas) |
| Pricing, plans, invoicing, payment collection | **Product** — or a dedicated billing product |

Metering passes all five tests. Pricing fails Test 2: your price list is not Workday's.

---

### 4.8 Design system → **PLATFORM** · Product UI → **PRODUCT**

Primitives (Button, Table, Dialog, tokens, dark mode) pass all five tests.
Screens, flows, navigation and domain widgets are content.

**The line:** if the component's props contain a domain noun, it is product-owned. `<Table>` is platform. `<PayrollTable>` is not.

---

### 4.9 Reporting and analytics → **SPLIT**

Query execution, aggregation and export are platform. Report definitions, metrics and dashboards are content.

---

### 4.10 `apps/cortex` inside the platform repository → **TEMPORARY, SCHEDULED**

Cortex is a product living in the platform repository. This violates nothing in the Constitution — it is a *repository layout* question, not a boundary question — but it becomes untenable at roughly 30 engineers, when four product teams share one CI queue and hold commit rights to the platform.

**Ruling:** permitted until the platform publishes versioned packages (Milestone 6). At that point Cortex moves to its own repository and consumes `@ryvan/sdk` at a pinned version, like any other product.

**Until then:** Cortex is bound by the boundary as if it were external. It may not import platform internals, and it may not receive platform changes made specifically for it.

---

### 4.11 The Certification Suite → **PLATFORM**

Platform-owned, per Constitution Article 18. It is the executable definition of "correctly built on RyvanOS" and cannot be owned by anything it certifies.

---

# 5 · Promotion and Demotion

The boundary is not permanent for any single capability. It is permanent for the *procedure*.

## Promotion — product → platform

**Trigger:** a second product needs a capability that currently lives in one.

**Procedure**

1. The second product's team **names what they need** — not "we need Cortex's X" but "we need a capability that does Y."
2. Run The Procedure against Y. If it fails any test, it is not promotable; both products implement their own.
3. Extract the **generalised** capability, not the existing implementation. Strip every domain noun.
4. The first product migrates to consume it. **Promotion is not complete until the original is deleted.**
5. Assign an owner in `OWNERSHIP_MATRIX.md`.
6. It enters at `Alpha` lifecycle state (Constitution Article 17), not `GA`.

**The failure mode to avoid:** copying the implementation into the platform and letting the original live on. That is not promotion; that is duplication with a nicer address.

## Demotion — platform → product

**Trigger:** a platform capability turns out to have exactly one real consumer, or has accumulated domain nouns.

**Procedure**

1. Confirm no other product consumes it.
2. Move it into the sole consumer.
3. Delete it from the platform and the SDK, following the deprecation window (Article 17) if it ever reached GA.
4. Record the demotion and its reason.

**Demotion is healthy.** A platform that only ever grows is a platform accumulating one product's assumptions. Nine packages were rejected before creation in this codebase; demotion is that same discipline applied late.

---

# 6 · Anti-Patterns

How the boundary erodes in practice. Each is a review-blocking finding.

| Anti-pattern | Looks like | Why it is fatal |
|---|---|---|
| **The Convenience Import** | A product imports `@ryvan/workflow-engine` directly because it is right there | Violates Article 3. Every platform refactor now breaks that product |
| **The Helpful Addition** | Adding `employeeId?: string` to a platform DTO for one product | Test 1 violated in a single field. The next product inherits a field that means nothing to it |
| **The Generic Name** | `EntityService`, `RecordManager`, `ItemProcessor` | Domain logic wearing a platform name. Apply Test 2: would a competitor's platform team build *this specific behaviour*? |
| **The Config Escape Hatch** | A platform capability taking a `Record<string, unknown>` that encodes product rules | The domain logic is still in the platform; it just no longer type-checks |
| **The Shared Utility Drift** | A helper in `common` that grows a domain-shaped special case | `common` is imported by everything, so the blast radius is total |
| **The Second Implementation** | A product writes its own retry/queue/cache because the platform's "does not quite fit" | Article 8. Either extend the platform's or explain in writing why it cannot be extended |
| **The Premature Platform** | Building a package because "all products will need it" with none named | Test 3. Speculative platform work is the most expensive kind — it is wrong *and* it is depended upon |
| **The Reverse Dependency** | The platform importing from a product, "just for types" | Inverts the entire architecture. Never permitted, under any justification |

---

# 7 · Enforcement and Escalation

## Mechanical

| Check | Enforces | Where |
|---|---|---|
| Lint: products may import only `@ryvan/sdk` and `@ryvan/contracts` | Article 3 | CI |
| Lint: no domain package imports another domain package | Article 4 | CI |
| Lint: `@ryvan/common` imports nothing internal | Article 4 | CI |
| Certification Suite | Articles 1, 3, 18 | Per product, CI |
| Dependency-graph check: no platform → product edge | §6 Reverse Dependency | CI |

## Human

Every PR introducing a package, a public API, or an SDK surface states:

> **Boundary:** PLATFORM · passes Tests 1–5 · second consumer: NexusOS (payroll approvals)

or

> **Boundary:** PRODUCT · fails Test 1 (domain noun: "candidate")

One line. If it cannot be written in one line, the capability is not understood well enough to build.

## Escalation

When The Procedure returns `AMBIGUOUS`:

1. **Default to PRODUCT.** Wrongly product-side costs one later promotion. Wrongly platform-side costs every product a permanent dependency on a bad abstraction. The costs are not symmetric.
2. Build it in the product.
3. When a second product needs it, promote via §5.
4. **Add the case and its ruling to §4**, so it is decided once and never re-argued.

---

# 8 · The One-Sentence Version

> **RyvanOS owns the engine and the contract. Products own the configuration and the content. If two products cannot share it while remaining strangers, it is not platform.**

---

*Phase 2 of the RyvanOS v1.0 foundation.*
*Next: `OWNERSHIP_MATRIX.md` · `ARCHITECTURE.md` · tag Foundation v1 · begin Alpha.*
