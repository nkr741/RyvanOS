# Cortex Event Catalog

Domain events powering the Ryvan Engineering System. Currently implemented as direct function calls within the Next.js monolith. Will migrate to NATS JetStream when extracting microservices.

## Events

### `survey.vendor.completed`

- **Producer:** Survey API (`/api/surveys/vendor`)
- **Consumers:** Lead Scoring Service, AI Summary Generator, Analytics Aggregator
- **Payload:** `{ surveyId, vendorId, bdeId, responses, gpsCoords, submittedAt }`
- **Idempotency Key:** `surveyId`
- **Notes:** Triggers lead scoring calculation and AI-generated vendor summary.

### `survey.rider.completed`

- **Producer:** Survey API (`/api/surveys/rider`)
- **Consumers:** Analytics Aggregator, Rider Intelligence Module
- **Payload:** `{ surveyId, riderId, bdeId, responses, gpsCoords, submittedAt }`
- **Idempotency Key:** `surveyId`

### `lead.scored`

- **Producer:** Lead Scoring Service
- **Consumers:** Follow-up Queue, Dashboard, Notification Service
- **Payload:** `{ vendorId, score, tier, scoringFactors, scoredAt }`
- **Idempotency Key:** `vendorId + scoredAt (daily)`

### `followup.scheduled`

- **Producer:** Follow-up API (`/api/followups`)
- **Consumers:** Notification Service, BDE Dashboard, Calendar Sync
- **Payload:** `{ followupId, vendorId, bdeId, scheduledAt, priority, notes }`
- **Idempotency Key:** `followupId`

### `followup.completed`

- **Producer:** Follow-up API (`/api/followups`)
- **Consumers:** Analytics Aggregator, Lead Scoring Service (re-score trigger)
- **Payload:** `{ followupId, vendorId, bdeId, outcome, completedAt, notes }`
- **Idempotency Key:** `followupId`

### `bde.report.generated`

- **Producer:** Report Scheduler (cron / server action)
- **Consumers:** Email Service, Admin Dashboard, Storage Service
- **Payload:** `{ reportId, bdeId, date, metrics, generatedAt }`
- **Idempotency Key:** `bdeId + date`

### `merchant.onboarded`

- **Producer:** Merchant Management Service
- **Consumers:** Analytics Aggregator, Notification Service, Billing Service
- **Payload:** `{ merchantId, vendorId, bdeId, onboardedAt, plan }`
- **Idempotency Key:** `merchantId`

## Migration Plan

1. Define event schemas as TypeScript interfaces in `src/lib/events/`
2. Wrap current function calls in an `emit()` abstraction
3. Add NATS client when infrastructure is ready
4. Swap transport layer without changing producer/consumer code
