# API Contracts

All API routes for Cortex Growth, grouped by domain. Built on Next.js App Router API routes.

Full OpenAPI specs will be generated when migrating to NestJS.

## Auth

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/login` | Authenticate user, return JWT |
| POST | `/api/auth/register` | Create new BDE/admin account |

## Dashboard

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/dashboard/stats` | Summary stats for logged-in BDE |
| GET | `/api/dashboard/analytics` | Detailed analytics with filters |

## Surveys

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/surveys/rider` | List rider surveys (paginated) |
| POST | `/api/surveys/rider` | Submit new rider survey |
| GET | `/api/surveys/rider/[id]` | Get single rider survey |
| GET | `/api/surveys/vendor` | List vendor surveys (paginated) |
| POST | `/api/surveys/vendor` | Submit new vendor survey |

## Follow-ups

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/followups` | List follow-ups for current BDE |
| POST | `/api/followups` | Create new follow-up |
| PUT | `/api/followups` | Update follow-up status/notes |

## Reports

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/reports/daily` | Generate/fetch daily BDE report |
| GET | `/api/reports/admin` | Admin aggregate report |

## Team Management

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/team` | List all team members |
| POST | `/api/admin/team` | Add team member |
| PUT | `/api/admin/team/[id]` | Update team member |
| DELETE | `/api/admin/team/[id]` | Remove team member |

## Competitor Intelligence

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/competitors/analysis` | Aggregated competitor data |

## Upload

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/upload` | Upload images/documents (S3) |

## Conventions

- All routes return `{ success: boolean, data?: T, error?: string }`.
- Auth via Bearer token in `Authorization` header.
- Pagination: `?page=1&limit=20` on list endpoints.
- Dates in ISO 8601 format.
