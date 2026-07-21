# Survey Intelligence Orchestrator

## Purpose

Coordinates the AI analysis pipeline that runs after every survey submission. Calls sub-agents (lead scorer, summarizer, follow-up engine) in parallel, merges their results, and writes the combined analysis to storage.

## Trigger

Invoked automatically when a new survey response is saved. Entry point: post-submission webhook or server action callback.

## Inputs

| Field | Type | Source |
|-------|------|--------|
| `surveyId` | string | Survey the response belongs to |
| `responseId` | string | The newly submitted response |
| `respondentEmail` | string | null | From survey response metadata |
| `answers` | `Record<questionId, answer>` | Raw answer data |
| `metadata` | `{ip, userAgent, referrer, duration}` | Submission context |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `leadScore` | `number (0-100)` | Conversion probability percentage |
| `scoreFactors` | `string[]` | Top 3 factors that influenced the score |
| `summary` | `string` | 2-3 sentence natural-language summary of the response |
| `followUp` | `{action, priority, reason}` | Recommended next step |
| `processingTime` | `number` | Total pipeline duration in ms |

## Pipeline Steps

1. **Validate** -- Confirm response exists and has not already been analyzed.
2. **Fan-out** -- Launch lead scoring, summarization, and follow-up recommendation in parallel.
3. **Merge** -- Combine results into a single `AnalysisResult` object.
4. **Store** -- Write to `ai_analysis` table linked to the response.
5. **Notify** -- If lead score exceeds threshold (configurable, default 70), push notification to survey owner.

## Tools

- **Lead Scoring Engine** -- Rule-based + ML hybrid. Weights: answer sentiment (30%), completion rate (20%), response time (15%), question-specific signals (35%).
- **Summary Generator** -- LLM call with structured prompt. Max 150 tokens output.
- **Recommendation Engine** -- Decision tree mapping score + answer patterns to actions (email, call, nurture, disqualify).

## Constraints

- **Time budget**: 5 seconds end-to-end. Sub-agents get 3 seconds each (parallel).
- **Idempotent**: Re-processing the same response overwrites the previous analysis.
- **No PII in logs**: Log response IDs and scores, never raw answers or emails.

## Failure Handling

| Failure | Fallback |
|---------|----------|
| LLM timeout | Use rule-based scoring (no summary) |
| LLM error | Retry once, then fall back to rules |
| Sub-agent partial failure | Store available results, mark analysis as `partial` |
| Full pipeline failure | Mark response as `analysis_pending`, queue for retry |

## KPIs

- **Lead score accuracy**: Compare predicted score vs actual conversion at 30/60/90 days.
- **Pipeline latency p95**: Target under 3 seconds.
- **Failure rate**: Target under 1% of submissions.
- **Summary quality**: Periodic human review, score 1-5 for accuracy and actionability.
