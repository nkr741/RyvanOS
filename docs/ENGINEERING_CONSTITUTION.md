# The Ryvan Engineering Constitution

**Status:** Ratified · **Applies to:** every engineer and every AI agent working in any Ryvan repository

---

## Preamble

**RyvanOS is an Enterprise Application Platform. AI is a first-class capability of the platform, not its sole identity.**

This distinction is deliberate and load-bearing. Identity, workflows, policy, events, storage, observability, security and governance are valuable with or without a language model. Building the platform around them — and treating AI as a capability that runs *on* that foundation rather than *as* it — is what keeps RyvanOS durable while the AI field churns.

Products (Cortex, NexusOS, RynOne, QAOS, and those not yet named) are built on RyvanOS. They must be able to share it **without knowing about each other**. That clause is the test behind most of what follows.

This document governs *how* we build. It does not describe *what* is built — architecture documents do that, and they change. This changes rarely, and only by the procedure in Article 20.

Every article below earned its place by catching something real in this codebase. None of it is imported from a book.

---

# Part I — The Boundary

### Article 1 · The Boundary Test

A capability belongs in RyvanOS if — and only if — **both** hold:

1. At least two products would independently need it, **and**
2. It can be fully specified without using a domain noun.

*Domain nouns:* lead, candidate, payroll, rider, invoice, ticket, test case, message thread, order.
*Platform nouns:* mission, workflow, policy, connector, span, tenant, quota, agent.

A capability failing either test belongs in a product repository, however elegant the code.

**Corollary — the engine/content split.** The platform owns the *engine and the contract*; products own the *configuration and the content*.

> `WorkflowRegistry` is platform. `payroll.run` is NexusOS.
> `PolicyEngine` is platform. *"Payroll is frozen at month-end"* is NexusOS.
> `Connector` is platform. *"What a Salesforce Account means to us"* is a product's mapping layer.

**Why this exists.** Nine packages were proposed for this platform and rejected as duplicates of capabilities that already existed. The ones that would have done lasting damage were not the duplicates — they were the packages that would have compiled, passed tests, and quietly shaped RyvanOS around one product's assumptions.

---

### Article 2 · One owner per capability

Every capability has exactly one owner. There is no shared ownership, no joint maintenance, no "both teams contribute."

Two implementations of Identity is two security models. Two implementations of Workflow is two definitions of "completed." Two implementations of Memory is two answers to "what does the system know."

When ownership is contested, it is resolved in `OWNERSHIP_MATRIX.md` before code is written — not after.

---

### Article 3 · Products depend on the SDK and nothing else

A product's dependency manifest contains exactly one platform entry: `@ryvan/sdk`.

The SDK is the **stability contract** and the **deprecation boundary**. Behind it, the platform may refactor freely. In front of it, changes follow Article 17.

Everything crossing that boundary is a type from `@ryvan/contracts`. A DTO defined twice is a boundary that has already leaked.

**Enforcement:** a lint rule fails any product import of `@ryvan/*` other than `sdk` and `contracts`.

**Why this exists.** Without it, every internal refactor is a breaking change for every product, and a deprecation policy becomes unaffordable. This rule is what makes the platform changeable at scale.

---

# Part II — Structure

### Article 4 · No domain package imports another domain package

A domain package may import `@ryvan/common` and `@ryvan/events`. Nothing else internal.

Where one package needs another's behaviour **synchronously**, it declares a **port** — an interface it owns, describing what it needs — and the composition root supplies the implementation.

Where the need is **asynchronous**, it uses an event.

**Exempt:** exactly three integration packages — the composition root, the persistence layer, and the console (which reads only through ports). Their exemption exists because integration is their entire purpose. No fourth package joins this list without an amendment.

**Why this exists.** This rule has held across twenty packages. It is the reason the "knows about two packages" surface in this platform is roughly two hundred lines and can be read in one sitting. It is the single property most responsible for this architecture being viable at scale.

---

### Article 5 · Ports are owned by the consumer

The package that *needs* the behaviour defines the interface. The package that *provides* it never knows who is calling.

A port shaped by its provider is an import wearing a costume.

---

### Article 6 · Definitions are declarative, serialisable, versioned, and immutable

Anything a product *defines* rather than *calls* — workflows, agents, connectors, policies, prompts — obeys all four:

- **Declarative.** Data, not behaviour. Handlers register by name.
- **Serialisable.** No closures. A definition holding a function cannot be stored, diffed, versioned or evaluated.
- **Versioned.** `id@version`. Executions pin their version at start.
- **Immutable.** Registering the same `id@version` twice is an error. Publish a new version instead.

**Why this exists.** An audit entry saying *"the payroll agent approved this"* is worthless if the payroll agent has since been edited. Immutable versioning is what makes the audit trail survive the question *"which one?"*

---

### Article 7 · Configuration is injected, never read

Packages receive configuration as typed objects. Only the composition root and entry-point scripts read the environment.

A package reaching for `process.env` cannot be tested twice with different settings, and cannot be embedded in a product that configures things differently.

---

# Part III — Correctness

### Article 8 · Check before you build

Before creating a package, a service, or a utility: search for it. If something adjacent exists, extend it or explain in writing why it cannot be extended.

Duplication discovered later is not a refactor. It is two behaviours that have already diverged, with callers depending on each.

**Why this exists.** Glob matching existed twice here, in packages that had to agree — and one governed security policy. Two implementations of the same grammar eventually disagree on an edge case, and that disagreement *is* the bug.

---

### Article 9 · A test must be able to fail

Every test must have a state of the world in which it fails and the feature is broken. A test that passes against a deliberately broken implementation is documentation with a green tick.

Write at least one test that attempts to **disprove** the implementation, not confirm it.

**Why this exists.** Every serious defect found in this platform was found by a test written adversarially: an audit ledger that reported an intact chain as tampered after a storage round-trip; a quota counter shared across every tenant; a bootstrap that had never once succeeded. None would have been found by a test written to confirm the happy path.

---

### Article 10 · Verify by executing, not by reading

A claim that something works is made only after running it in the form it will actually run.

- Code that will run under Node is verified under Node, not only under a bundler.
- Code that will run against Postgres is verified against Postgres, not only against an in-memory double.
- An image that will be built is built.

**Why this exists.** This platform once passed its entire test suite while being unable to start, because the test runner bundled a CommonJS import that native ESM rejects. Every test was green; the first line of production failed.

---

### Article 11 · Fix the cause, not the symptom

A flaky test is a defect until proven otherwise. Re-running it until it passes hides a real race.

When a test fails for an incidental reason — timing, load, ordering — fix the test so it can only fail for the reason it exists to detect.

---

### Article 12 · Report outcomes exactly

State what was verified and what was assumed. If tests fail, say so with the output. If a step was skipped, say which and why. If a number is quoted, it was counted.

Confidence that outruns evidence is the most expensive thing an engineer can produce, because it removes the reason for anyone to check.

**Why this exists.** This platform's own documentation once claimed a test count that was thirty higher than the truth. Nobody was misled by malice; a number was carried forward without being recounted.

---

# Part IV — Runtime Guarantees

### Article 13 · Governance precedes action

Nothing consequential happens before it is authorised. Policy is evaluated, budgets and quotas are checked, and approvals are obtained **before** the work is performed — never after.

Specifically: a policy denial must block a call before it reaches a model, a vendor, or a payment. Governance that runs after the money is spent is documentation.

---

### Article 14 · State that matters survives a restart

Any state whose loss would surprise a user is durable. Missions, workflow runs, approvals, audit entries, identity, secrets and traces are all in this category.

In-memory implementations exist for tests and local development, and are held to identical behaviour by a shared conformance suite. They are never the production default without an explicit, logged warning.

**Test of compliance:** stop the process mid-flight, start a new one, and the work continues from where it stopped.

---

### Article 15 · Evidence is not observability

**Observability** answers *"why was it slow?"* It may sample, drop, expire and approximate.
**Evidence** answers *"prove what happened."* It may do none of those.

They have opposite requirements for retention, integrity and access. They are never merged, never share a storage policy, and never share a package.

An audit ledger is append-only, tamper-evident, and complete. If it is ever sampled, it has stopped being evidence.

---

### Article 16 · Fail loudly, fail closed, and never fake success

- An unrecoverable failure raises. It does not return a value that reads as success.
- A security or governance check that cannot complete **denies**.
- Work that has been parked for later is reported as parked, never as done.
- A missing critical configuration prevents startup rather than degrading silently.

**Why this exists.** Work queued after a failure must never be reported as complete. A caller told "success" will believe the payment went through when it is sitting in a dead-letter queue.

---

# Part V — Lifecycle

### Article 17 · Everything public has a lifecycle state

Every package, SDK surface, public API, agent, workflow, connector and prompt carries exactly one state:

| State | Meaning | Breaking changes | Support |
|---|---|:--:|---|
| **Alpha** | Shape is being learned | Any time | None |
| **Developer Preview** | Usable, shape may still move | With notice | Best effort |
| **Beta** | Shape settled, hardening | Minor versions only | Best effort |
| **Release Candidate** | Frozen pending validation | Defect fixes only | Best effort |
| **General Availability** | Supported | Major versions only | Full |
| **LTS** | Long-term supported | None | Full, fixed window |
| **Maintenance** | Security and defects only | None | Security only |
| **Deprecated** | Scheduled for removal | None | None; removal date published |

**Rules:**
1. Nothing reaches GA without documentation, tests, and a certification pass.
2. GA → Deprecated requires a published removal date at least **two major versions** away.
3. Deprecated surfaces warn at runtime, naming their replacement.
4. A product may depend on GA and LTS surfaces. Depending on anything earlier is a recorded, accepted risk.

**Why this exists.** *"Is this API supported?"* is the first question an enterprise asks and the last one a young platform can answer. Answering it requires having decided in advance.

---

### Article 18 · Every product passes the same certification

The **Ryvan Certification Suite** is the executable definition of "correctly built on RyvanOS." Every product runs it. Certification is binary and public: `PASS` or `FAIL`.

It verifies, at minimum, that a product:

- imports the SDK and nothing else from the platform;
- launches missions rather than orchestrating work itself;
- carries no capability the platform already owns (Article 1);
- allows governance to deny it, and behaves correctly when denied;
- produces a complete audit trail and trace for its work;
- survives a platform restart mid-flight.

The suite is platform-owned. When it grows, every product re-certifies.

**Why this exists.** *"Does the platform work?"* is otherwise unanswerable except by opinion. This makes it a test result, per product, permanently.

---

### Article 19 · Multi-tenant isolation is enforced, never assumed

Tenant scoping is structural. A query that omits its tenant scope must be **impossible to express**, not merely discouraged by convention or caught in review.

One forgotten filter is a cross-tenant data leak. Conventions are forgotten; types and wrappers are not.

---

# Part VI — Governing this document

### Article 20 · Amendment

This constitution changes by amendment, never by drift.

An amendment requires: a written statement of the rule being changed, the concrete situation that showed it inadequate, and the replacement. Amendments are appended with their date and reasoning. **Superseded articles are struck through, never deleted** — the history of why a rule changed is more instructive than the rule.

A rule that is routinely violated without an amendment is a governance failure, not an engineering shortcut.

---

### Article 21 · Rules for AI agents

Ryvan is built substantially by AI agents. They are bound by every article above, and additionally:

1. **Read before writing.** Inspect the existing implementation before proposing a new one. Article 8 applies with full force — an agent's speed makes duplication cheaper to create and no cheaper to live with.
2. **Never claim unverified success.** Report what was executed. "The tests pass" means they were run and their output was read.
3. **Surface disagreement.** An agent that believes an instruction is architecturally wrong says so once, clearly, then follows the decision. Silent compliance with a bad instruction is a failure of the agent, not the instructor.
4. **Prefer deletion to addition.** The most valuable output is often a package that was not created.
5. **Leave the reasoning, not the narration.** Comments explain *why* a decision was made, especially where the obvious approach was rejected. They do not restate what the code does.
6. **Stay inside the boundary.** An agent may not create a package, port or public API that violates Articles 1, 3 or 4 — even when asked. It raises the conflict instead.

**Why this exists.** Generation is no longer the bottleneck; verification and judgement are. These rules exist to keep the scarce thing scarce.

---

## Closing

Every rule here was written after something went wrong. A duplicate that had already diverged. A ledger that reported itself tampered. A platform that could not start. A counter shared across tenants. A number quoted without being counted.

None of them were caught by review. All of them were caught by execution.

That is the disposition this document exists to preserve: **the platform is trustworthy in exactly the ways it has been tested, and nowhere else.**

---

*Ratified as Phase 1 of the RyvanOS v1.0 foundation.*
*Next: `PLATFORM_BOUNDARY.md` · `OWNERSHIP_MATRIX.md` · `ARCHITECTURE.md` · RyvanOS Alpha.*
