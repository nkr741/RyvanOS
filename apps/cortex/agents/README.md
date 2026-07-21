# Cortex AI Agents

These are the AI agents that power Cortex Growth's intelligence layer. Each agent encapsulates a specific analytical capability, operates on survey and lead data, and returns structured outputs that feed into the platform's dashboards and workflows.

## Architecture

Agents are invoked after key platform events (survey submission, data threshold, scheduled batch). The Orchestrator coordinates agent execution and manages fallback behavior.

```
Survey Submission
       |
       v
  Orchestrator
  /     |     \
Score  Summarize  Recommend
  \     |     /
       v
  Stored Results --> Dashboard
```

## Agent Registry

| Agent | Purpose | Status | Spec |
|-------|---------|--------|------|
| **Orchestrator** | Coordinates post-survey AI pipeline | Planned | [`orchestrator.md`](./orchestrator.md) |
| **Researcher** | Competitive intelligence from survey data | Planned | [`researcher.md`](./researcher.md) |
| **Lead Scorer** | Assigns conversion probability to leads | Planned | -- |
| **Summarizer** | Generates natural-language survey summaries | Planned | -- |
| **Follow-up Engine** | Recommends next-best-action for each lead | Planned | -- |
| **Anomaly Detector** | Flags unusual response patterns | Planned | -- |

## Conventions

- Each agent spec lives in this directory as `<agent-name>.md`.
- Specs define: purpose, inputs, outputs, tools, constraints, failure handling, and KPIs.
- Agents must be idempotent -- re-running on the same input produces the same output.
- All agent outputs are stored with timestamps and input hashes for auditability.
- Agents that exceed their time budget must return a degraded result, never hang.

## Integration Points

- **Trigger**: `src/lib/agents/` will contain the runtime agent implementations.
- **Storage**: Agent outputs write to the `ai_analysis` Prisma model (planned).
- **API**: Agent results are served via tRPC routes under `api.ai.*` (planned).
