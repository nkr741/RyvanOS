# AIOS Capability Matrix

> Track which AIOS capabilities each agent actually uses.
> Updated as agents migrate to AIOS infrastructure.
> This document will inform the future Capability Registry design.

## Current State (Post-Sprint 2)

### Cortex Agents

| Agent | Models | Memory | Tools | Events | Planning | DB Direct | Status |
|-------|--------|--------|-------|--------|----------|-----------|--------|
| **JARVIS** | ModelService (AIOS) | MemoryManager (AIOS) | 7 tools via ToolService | EventBus (audit trail) | — | Yes | **On AIOS (Sprint 3)** |
| Research | ai-engine (deterministic) | Yes (2 calls) | Declared, never called | Pub + Sub | Static metadata | Yes | Adapter layer |
| Proposal | ai-engine (deterministic) | Yes (1 call) | Declared, never called | Pub + Sub | Static metadata | Yes (read) | Adapter layer |
| CRM | ai-engine (deterministic) | Declared, unused | Declared, never called | Pub + Sub | Static metadata | Yes | Adapter layer |
| Growth | — | Declared, unused | Declared, never called | Pub + Sub | Static metadata | Yes | Adapter layer |
| Notification | — | Declared, unused | — | Pub + Sub | Static metadata | Yes | Adapter layer |
| Outreach | — | Declared, unused | Declared, never called | Pub + Sub | Static metadata | Yes | Adapter layer |

### Key Findings

1. **JARVIS is the only real LLM caller** — all other agents use deterministic scoring from `@/lib/ai-engine`
2. **No agent calls `ctx.useTool()`** — declared in manifests but never invoked; all DB access is direct Prisma
3. **Only 2 of 6 agents use memory** — Research and Proposal; the other 4 declare scopes but never read/write
4. **All `plan()` methods are static** — hardcoded step descriptions, no computation during planning
5. **Event bus is the primary integration** — all 6 agents subscribe and publish; this is the real coupling mechanism

### AIOS Service Usage via Adapters

| Service | Adapter File | Consumers | AIOS Path | Legacy Fallback |
|---------|-------------|-----------|-----------|-----------------|
| Models | `src/lib/llm.ts` | 3 files | ModelService → AnthropicAdapter | Direct Anthropic/Ollama |
| Events | `src/cortex/runtime/event.ts` | 7 files | EventBus + DB persistence middleware | — |
| Memory | `src/cortex/runtime/memory.ts` | 1 file | MemoryManager | — |
| Tools | `src/cortex/runtime/tool.ts` | 2 files | ToolService (dual registration) | Local registry |
| Identity | `src/lib/auth.ts` | 38 files | Password hashing via AIOS | Legacy JWT (claim format differs) |

## Sprint 3 Target: JARVIS on AIOS

JARVIS must migrate from direct SDK usage to AIOS services:

| Capability | Current | Target | Risk |
|------------|---------|--------|------|
| LLM calls | `Anthropic` SDK direct | `ModelService.chat()` via adapter | Low — adapter already exists |
| Tools (7) | Inline tool schemas + `runTool()` | `ToolService.register()` + `execute()` | Medium — 7 tools to register |
| Memory | None | `MemoryManager` for conversation context | Low — new capability |
| Events | None | Emit on every action (audit trail) | Low — new capability |
| Latency | Not tracked | Record planning/tools/models/total | Low — instrumentation |

### JARVIS Tool Inventory

| Tool | Purpose | Data Source |
|------|---------|-------------|
| `get_org_status` | Organization overview | Prisma |
| `get_stats` | Pipeline statistics | Prisma |
| `list_leads` | Lead pipeline data | Prisma |
| `delegate` | Dispatch work to departments | Delegation engine |
| `locate_bde` | BDE staff location | Prisma |
| `get_field_activity` | Field team activity | Prisma |
| `get_comms` | Communication history | Prisma |

## Event Flow Topology

```
Mission Created
    │
    ▼
Research Agent ──────► merchant.analyzed.v1
    │                       │
    │                       ├──► Proposal Agent ──► proposal.generated.v1
    │                       │                              │
    │                       └──► CRM Agent ◄───────────────┘
    │                               │
    ▼                               ▼
pipeline.reviewed.v1        followup.created.v1
    │                               │
    └──────► Notification Agent ◄───┘

Company Discovered
    │
    ▼
Growth Agent ──────► company.qualified.v1
    │                       │
    │                       ▼
    └──────────────► Outreach Agent
```

## Future Products (Placeholder)

| Agent | Models | Memory | Tools | Planning | Workflow | Knowledge |
|-------|--------|--------|-------|----------|----------|-----------|
| RYN (TBD) | ? | ? | ? | ? | ? | ? |
| RynOne (TBD) | ? | ? | ? | ? | ? | ? |

> Fill in as products are built. Patterns across this matrix will inform the Capability Registry design.
