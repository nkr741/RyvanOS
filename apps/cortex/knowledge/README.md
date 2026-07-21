# Knowledge Vault

> Institutional memory for Ryvan Technologies. Everything goes here. After a year, this becomes extremely valuable.

## Structure

```
knowledge/
  business/        — Business model, revenue, partnerships, market analysis
  architecture/    — System design, ADRs, diagrams, tech stack decisions
  engineering/     — Technical standards, runbooks, incident postmortems
  research/        — Market research, technology evaluations, benchmarks
  competitors/     — Competitor analysis, feature comparisons, pricing
  product/         — PRDs, roadmaps, feature specs, user feedback
  surveys/         — Restaurant surveys, rider interviews, field data
  decisions/       — ADRs, trade-off analyses, why we chose X over Y
  meetings/        — Meeting notes, action items, decisions made
```

## Rules

1. Every survey from restaurants goes into `surveys/`
2. Every rider interview goes into `surveys/`
3. Every architecture decision gets an ADR in `decisions/`
4. Every customer conversation is summarized in `business/`
5. Every competitor insight goes into `competitors/`
6. Use ISO dates in filenames: `2026-07-14-topic.md`
7. Every document has a one-line summary at the top
8. Tag documents with categories for AI search

## Search

Cortex AI can search this vault. Structure documents for searchability:
- Clear titles
- One-line summaries
- Consistent tagging
- Cross-references between related documents
