# ADR-002: Why SQLite for Dev, PostgreSQL for Prod

## Status

Accepted

## Date

2026-07-14

## Context

The BDE team needs rapid local development without database infrastructure setup. Developers should be able to clone the repo and start working immediately. However, production requires ACID compliance under concurrent writes, full-text search, and horizontal scaling. The Prisma adapter pattern makes it possible to use different databases per environment.

## Decision

Use SQLite via Prisma's adapter pattern for local development and PostgreSQL for production.

## Alternatives Considered

### Alternative 1: PostgreSQL Everywhere

- **Pros:** Identical behavior across environments, no adapter switching
- **Cons:** Requires Docker or local PostgreSQL install; adds setup friction for BDE team members who are not backend engineers
- **Why rejected:** Local setup friction slows onboarding and daily development for the BDE team

### Alternative 2: SQLite Everywhere

- **Pros:** Zero setup, single-file database, fast
- **Cons:** No concurrent write support, limited full-text search, not suitable for multi-instance production
- **Why rejected:** Cannot handle production concurrency and scale requirements

## Consequences

### Positive

- Zero-config local development: `npm run dev` just works
- Production gets battle-tested PostgreSQL with full ACID and concurrency
- Prisma adapter pattern keeps application code database-agnostic

### Negative

- Subtle SQL dialect differences can cause dev/prod divergence
- Must validate migrations against both databases in CI

### Risks

- A query that works in SQLite but fails in PostgreSQL ships to production; mitigated by running CI tests against PostgreSQL

## Compliance

| Standard | Impact |
|----------|--------|
| Database standards | Defines dual-database strategy and migration workflow |

## References

- [Prisma Driver Adapters](https://www.prisma.io/docs/orm/overview/databases/driver-adapters)

---

*Template: Ryvan Engineering System (RES) -- Cortex Growth / rynOne*
