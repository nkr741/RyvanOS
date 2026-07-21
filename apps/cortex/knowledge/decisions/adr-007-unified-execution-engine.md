# ADR-007: Unified Execution Engine

## Status

Accepted — Implemented in Sprint 5B

## Date

2026-07-21

## Context

Cortex has three independent execution systems that emerged organically as the product grew:

### System 1: Mission Orchestrator (`src/cortex/engine/orchestrator.ts`)

Built first for agent-based workflows (merchant acquisition, company research). Uses hardcoded `MISSION_TEMPLATES` to plan step sequences, dispatches each step to a registered `BaseAgent` from the `AgentRegistry`. Agents have a 10-state lifecycle (idle → awakened → planning → executing → validating → publishing → completed → sleeping). Approval is policy-based via `ApprovalGateway` with `Notification` creation. Supports retry, cancel. Fails the entire mission on any step failure.

### System 2: JARVIS / Assistant (`src/cortex/assistant/index.ts`)

The founder's conversational agent. Stateless request/response: receives conversation history, runs an iterative tool-use loop (up to 6 iterations) with the Anthropic API, returns text. No persistent state, no mission record, no approval mechanism. Cost is tracked per-call to `LlmUsageLog` but without a `correlationId`, making it un-aggregatable. Delegates real work via the `delegate` tool to the org/delegation system.

### System 3: Playbook Runtime (`src/cortex/execution/playbook.ts`)

Built for the outreach pipeline (discovery → qualification → proposal → email). Uses database-stored `Playbook` definitions with typed `Executor` handlers from an `ExecutorRegistry`. Creates `WorkItem` records per stage. Builds rich prospect context with intelligence and signals. Email sending happens at approval time. Has no retry, no cancel, and critically: a failed work item silently stops progress without failing the mission.

### Why three runtimes exist

Each was built to solve an immediate product need:

- The **Orchestrator** was the first execution system, designed around the abstraction of AI agents with rich internal state machines. It modeled work as "agent tasks" because Cortex started as an agent-orchestration platform.
- **JARVIS** needed a fundamentally different model — an interactive conversation loop, not a planned pipeline. It was built separately because shoe-horning a chat interface into a mission pipeline would have been wrong.
- The **Playbook Runtime** was built when the outreach pipeline needed database-defined workflows with typed executors (proposal generator, email sender, meeting scheduler, CRM updater). The Orchestrator's agent abstraction was too heavy — outreach stages are not "agents," they're functions. Playbooks also needed rich prospect context and email-at-approval, which the Orchestrator's approval gateway didn't support.

Each decision was correct at the time. The problem is not that they exist — it's that Systems 1 and 3 now duplicate significant infrastructure.

## Decision

Unify Systems 1 (Mission Orchestrator) and 3 (Playbook Runtime) into a single **Execution Engine**. System 2 (JARVIS) remains separate — it is fundamentally a conversational LLM loop, not an execution pipeline.

### What moves into the Execution Engine

| Capability | Current Location | Unified As |
|---|---|---|
| Mission lifecycle (create → execute → complete/fail) | Orchestrator + Playbook | `ExecutionEngine.run()` |
| Work unit sequencing | `MissionStep` + `WorkItem` | Single `ExecutionUnit` model |
| Cost/duration aggregation | Duplicated in both | `ExecutionEngine.finalize()` |
| Approval gateway | `ApprovalGateway` (System 1 only) | Available to all work units |
| Progress tracking | Duplicated formula | `ExecutionEngine.updateProgress()` |
| Retry / cancel | Orchestrator only | Available to all missions |
| Event publishing | Same eventBus, different event names | Normalized event vocabulary |
| Error propagation | Fail-fast (S1) vs. silent-stop (S3) | Configurable failure policy |

### What remains product-specific

| Capability | Why It Stays Separate |
|---|---|
| `MISSION_TEMPLATES` | Domain-specific step definitions — an input to the engine, not part of it |
| `BaseAgent` + `AgentRegistry` + 10-state lifecycle | Agent execution is a rich runtime concern; the engine dispatches to it, doesn't own it |
| `AgentContext` / `AgentMemory` / reasoning traces | Agent-scoped, not execution-scoped |
| `Playbook` definitions (DB-stored) | An input to the engine, like templates |
| `ExecutorRegistry` + typed executors | Executor execution is simpler than agents; the engine dispatches to it |
| Prospect context building (`buildProspectContext`) | Domain-specific data assembly |
| Email-at-approval (`sendEmail` in `approveWorkItem`) | Product behavior, not engine concern |
| JARVIS tool-use loop | Different execution model entirely |

### What does NOT move

- **JARVIS** stays as-is. It is not a pipeline; it is a conversation. Forcing it into the execution engine would add complexity without benefit.
- **Agent internals** (plan → execute → validate → publish lifecycle) stay in `BaseAgent`. The engine calls agents; it does not become an agent.
- **Playbook seeding** stays in the playbook module. The engine does not know about playbook definitions.
- **Domain logic** in executors (proposal generation, email composition, CRM sync) stays in executor implementations.

### Architecture

```
                    ┌─────────────────────┐
                    │   Execution Engine   │
                    │                     │
                    │  • Mission lifecycle │
                    │  • Unit sequencing   │
                    │  • Approval gateway  │
                    │  • Cost aggregation  │
                    │  • Retry / Cancel    │
                    │  • Event publishing  │
                    │  • Failure policy    │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         ┌────┴────┐    ┌─────┴─────┐   ┌──────┴──────┐
         │  Agent   │    │ Executor  │   │   Future    │
         │ Adapter  │    │ Adapter   │   │  Adapters   │
         └────┬────┘    └─────┬─────┘   └─────────────┘
              │                │
     ┌────────┴───────┐  ┌────┴──────┐
     │  AgentRegistry │  │ Executor  │
     │  + BaseAgent   │  │ Registry  │
     └────────────────┘  └───────────┘
```

Mission Orchestrator creates missions with agent-backed units.
Playbook Runtime creates missions with executor-backed units.
Both use the same Execution Engine for lifecycle, approval, cost, and progress.

### JARVIS integration point

JARVIS remains separate but gains a `correlationId` for cost tracking. When JARVIS's `delegate` tool creates a mission, the mission ID flows back so the assistant can report on delegated work status.

## Alternatives Considered

### Alternative 1: Keep three systems, extract shared utilities

- **Pros:** Lowest risk, no migration needed
- **Cons:** Duplication grows as features are added to one system but not the other (retry only in S1, notifications only in S1, cancel only in S1). Bug fixes must be applied twice.
- **Why rejected:** The systems are diverging in capability rather than converging. System 3 already has critical gaps (no mission failure propagation, no retry, no cancel) that exist solely because the code was copied without the full feature set.

### Alternative 2: Merge everything including JARVIS into one engine

- **Pros:** Single execution path for all work
- **Cons:** Conversational LLM loops are fundamentally different from planned pipelines. Forcing JARVIS into a mission model adds artificial state management and persistence for what is a stateless request/response pattern.
- **Why rejected:** Architectural purity is not worth the complexity cost. JARVIS works well as-is.

### Alternative 3: Replace all three with a generic workflow engine (Temporal-style)

- **Pros:** Industry-proven pattern, handles retries and timeouts natively
- **Cons:** Massive dependency, operational overhead, over-engineered for current scale (< 100 missions/day)
- **Why rejected:** We don't need a distributed workflow engine. We need to deduplicate two sequential pipeline implementations in a single-process monolith.

## Implementation Plan

### Phase 1: Engine core

Create `src/cortex/execution/engine.ts` with:
- `createExecution(config)` — creates Mission + ExecutionUnits from a plan
- `runExecution(missionId)` — sequential loop with approval pauses, data piping, error handling
- `finalizeExecution(missionId)` — cost aggregation, duration, completion event
- `retryExecution(missionId)` / `cancelExecution(missionId)` — lifecycle operations
- Configurable `FailurePolicy`: `fail-fast` | `continue-on-error`

### Phase 2: Adapters

- `AgentAdapter` — wraps `BaseAgent.run()` as an execution unit handler
- `ExecutorAdapter` — wraps existing executor functions as execution unit handlers
- Both implement a common `UnitHandler` interface: `execute(input, context) → output`

### Phase 3: Migration

- Rewrite `orchestrator.executeMission()` to delegate to `ExecutionEngine.runExecution()`
- Rewrite `playbookRuntime.executeNextStage()` to delegate to `ExecutionEngine.runExecution()`
- Both keep their `createMission()` / `startMission()` entry points (they build different plans)
- Both keep their domain-specific context building

### Phase 4: Cleanup

- Remove duplicated lifecycle code from orchestrator and playbook
- Normalize event types
- Add retry/cancel to playbook missions (free — comes from the engine)

## Consequences

### Positive

- One place for mission lifecycle bugs and features
- Playbook missions gain retry, cancel, and notification support for free
- Silent failure gap in playbooks is fixed by the engine's configurable failure policy
- New execution types (event-triggered, scheduled) only need a new adapter, not a new runtime
- Smaller surface area for security and observability concerns

### Negative

- Migration risk: both systems must continue working during the transition
- Adapter indirection adds a (thin) layer between the engine and agent/executor implementations

### Risks

- Trying to unify too aggressively and losing domain-specific behavior. Mitigate by keeping adapters thin and domain logic in the existing modules.
- Breaking the orchestrator's retry/cancel semantics during migration. Mitigate by writing tests for the engine before migrating callers.

## Compliance

| Standard | Impact |
|----------|--------|
| Architecture standards | Eliminates prohibited execution model duplication (hard rule: no fourth runtime) |
| Testing standards | Engine must have unit tests before any caller migrates to it |

## References

- Sprint 4.3 review: "Execution Unification — merge Mission/JARVIS/Playbook into shared Execution Engine, only with real operational data"
- Sprint 5A review: "AIOS Foundation complete. Usage-driven architecture only."
- Hard governance rule: "No new execution model may be introduced from this point onward."

---

*Template: Ryvan Engineering System (RES) — Cortex Growth / rynOne*
