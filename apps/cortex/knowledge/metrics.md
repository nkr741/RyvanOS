# Metrics Catalogue

Define every KPI before coding dashboards. Each metric has a single owner and a clear data source.

## Acquisition & Growth

### Merchant Acquisition Rate
- **Definition:** New merchants onboarded per week.
- **Formula:** `COUNT(merchants WHERE onboardedAt IN current_week)`
- **Target:** 20+ per BDE per month
- **Owner:** Growth Lead
- **Source:** `Merchant` table

### Lead Conversion Rate
- **Definition:** Percentage of new leads that reach onboarded status.
- **Formula:** `COUNT(status = 'onboarded') / COUNT(status = 'new') * 100`
- **Target:** 30%+
- **Owner:** Growth Lead
- **Source:** `Merchant` table (status transitions)

## BDE Performance

### Daily Active BDEs
- **Definition:** BDEs who submitted at least one survey today.
- **Formula:** `COUNT(DISTINCT bdeId WHERE survey.submittedAt = today)`
- **Target:** 90%+ of team active daily
- **Owner:** Operations Manager
- **Source:** `Survey` table

### Surveys per BDE per Day
- **Definition:** Average surveys submitted per active BDE per day.
- **Formula:** `COUNT(surveys today) / COUNT(active BDEs today)`
- **Target:** 8+
- **Owner:** Operations Manager
- **Source:** `Survey` table

### Survey Completion Rate
- **Definition:** Percentage of started surveys that are submitted.
- **Formula:** `COUNT(status = 'submitted') / COUNT(status IN ('draft','submitted')) * 100`
- **Target:** 90%+
- **Owner:** Product Lead
- **Source:** `Survey` table

### Average Lead Score
- **Definition:** Mean lead score across all scored vendors.
- **Formula:** `AVG(score) WHERE score IS NOT NULL`
- **Target:** Calibrate after 500+ scores
- **Owner:** Data Lead
- **Source:** `LeadScore` table

## Follow-up Effectiveness

### Follow-up Completion Rate
- **Definition:** Percentage of scheduled follow-ups marked complete.
- **Formula:** `COUNT(status = 'completed') / COUNT(all followups) * 100`
- **Target:** 80%+
- **Owner:** Operations Manager
- **Source:** `FollowUp` table

## Delivery & Operations

### Delivery SLA Compliance
- **Definition:** Orders delivered within promised time window.
- **Formula:** `COUNT(deliveredAt <= slaDeadline) / COUNT(all deliveries) * 100`
- **Target:** 95%+
- **Owner:** Operations Manager
- **Source:** `Delivery` table

### Rider Acceptance Rate
- **Definition:** Percentage of delivery requests accepted by riders.
- **Formula:** `COUNT(accepted) / COUNT(offered) * 100`
- **Target:** 85%+
- **Owner:** Operations Manager
- **Source:** `DeliveryRequest` table

## Merchant Health

### Partner Churn Rate
- **Definition:** Merchants who stop transacting in a 30-day window.
- **Formula:** `COUNT(no orders in 30 days AND was active) / COUNT(active merchants) * 100`
- **Target:** < 5% monthly
- **Owner:** Growth Lead
- **Source:** `Order` + `Merchant` tables

### Average Orders per Merchant
- **Definition:** Mean orders per active merchant per month.
- **Formula:** `COUNT(orders this month) / COUNT(active merchants)`
- **Target:** 50+ per month
- **Owner:** Growth Lead
- **Source:** `Order` table

### Revenue per Merchant
- **Definition:** Average monthly revenue generated per active merchant.
- **Formula:** `SUM(order value this month) / COUNT(active merchants)`
- **Target:** Establish baseline, then 10% MoM growth
- **Owner:** Finance Lead
- **Source:** `Order` table
