# Market Research Agent

## Purpose

Analyzes competitor intelligence extracted from survey responses. Aggregates mentions of competitor products, pricing signals, and pain points across all responses to build a running competitive landscape for each survey owner.

## Trigger

Runs as a batch job on two schedules:
- **Real-time**: After each survey response that mentions a competitor (keyword detection).
- **Daily**: Aggregation pass over all responses from the past 24 hours.

## Inputs

| Field | Type | Source |
|-------|------|--------|
| `surveyId` | string | Target survey |
| `responses` | `Response[]` | All responses in the analysis window |
| `competitorKeywords` | `string[]` | Configured competitor names and product terms |
| `existingProfiles` | `CompetitorProfile[]` | Previously built competitor data |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `marketShare` | `Record<competitor, percentage>` | Estimated usage share from mention frequency |
| `pricingInsights` | `{competitor, signal, confidence}[]` | Pricing references extracted from responses |
| `painPoints` | `{theme, frequency, severity, quotes}[]` | Grouped pain points with representative quotes |
| `trends` | `{metric, direction, delta, period}[]` | Week-over-week changes in key metrics |
| `recommendations` | `string[]` | Actionable competitive insights (max 5) |

## Processing Steps

1. **Extract** -- Scan open-text answers for competitor mentions using keyword matching + NER.
2. **Classify** -- Categorize each mention: product comparison, pricing reference, pain point, praise, or neutral.
3. **Aggregate** -- Group by competitor and category. Calculate frequencies and sentiment scores.
4. **Trend** -- Compare current aggregation against previous period to detect shifts.
5. **Synthesize** -- Generate top-5 actionable recommendations from the data.
6. **Update profiles** -- Merge new data into persistent competitor profiles.

## Memory

The agent maintains running `CompetitorProfile` objects per survey:

```
CompetitorProfile {
  name: string
  mentionCount: number
  sentimentScore: number (-1 to 1)
  topPainPoints: string[]
  pricingSignals: string[]
  lastUpdated: Date
  trendDirection: "growing" | "stable" | "declining"
}
```

Profiles are append-only with rolling 90-day windows. Older data is summarized, not deleted.

## Constraints

- **Batch time budget**: 30 seconds for daily aggregation of up to 1,000 responses.
- **Real-time budget**: 2 seconds per individual response scan.
- **Privacy**: Never store raw respondent identifiers in competitor profiles. Quotes are anonymized.
- **Minimum data**: Requires at least 10 responses to generate market share estimates. Below that, return raw mention counts only.

## Failure Handling

| Failure | Fallback |
|---------|----------|
| NER model unavailable | Fall back to keyword-only extraction |
| Insufficient data | Return partial results with confidence flags |
| Profile merge conflict | Keep both versions, flag for manual review |

## KPIs

- **Insight accuracy**: Quarterly validation of top insights against market data.
- **Actionable recommendation rate**: Percentage of recommendations marked "useful" by survey owners. Target: 60%+.
- **Extraction recall**: Percentage of competitor mentions successfully detected. Target: 90%+.
- **Profile freshness**: Percentage of active profiles updated within the last 7 days.
