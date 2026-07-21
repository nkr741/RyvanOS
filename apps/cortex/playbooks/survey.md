# Survey Module Playbook

## Why

Core data collection engine for hyperlocal commerce intelligence. Surveys capture vendor pain points, delivery patterns, competitor usage, pricing data, and rider satisfaction. Every downstream feature (lead scoring, AI summaries, competitor analysis, merchant onboarding) depends on survey quality.

## Who

- **Primary users:** BDEs (Business Development Executives) in the field.
- **Device:** Mobile phones, often mid-range Android.
- **Environment:** Poor/intermittent connectivity, bright sunlight, one-handed operation while standing at vendor shops.
- **Secondary users:** Admins reviewing submitted data.

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Surveys per BDE per day | 8+ | Daily count per BDE |
| Completion time | < 5 minutes | Time from open to submit |
| Completion rate | > 90% | Submitted / started |
| Lead score accuracy | > 75% match to conversion | Scored leads vs actual onboards |
| Follow-up conversion | > 70% | Follow-ups that lead to next step |

## KPIs

- **Daily:** 8+ surveys submitted per BDE.
- **Per survey:** Under 5 minutes to complete.
- **Conversion funnel:** 70%+ of scored leads receive follow-up, 30%+ of follow-ups convert.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Offline submission | Queue locally, sync when online. Show pending count. |
| Duplicate entries | Deduplicate by vendor phone + GPS + time window (15 min). |
| Incomplete surveys | Allow save-as-draft. Flag incomplete in dashboard. |
| GPS failure | Fall back to manual area selection. Log GPS status. |
| Survey abandoned mid-way | Auto-save progress every 30 seconds. Resume on reopen. |
| Vendor refuses to answer | Allow "declined" option per question. Track refusal rate. |

## Implementation Notes

- Form state managed client-side with auto-save to localStorage.
- GPS captured at survey start, not per question.
- Photo upload optional, compressed client-side before upload.
- Lead score calculated server-side on submission via `survey.vendor.completed` event.
