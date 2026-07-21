# ADR-005: Why Prisma v7

## Status

Accepted

## Date

2026-07-14

## Context

Cortex Growth needs type-safe database access that integrates tightly with TypeScript, supports migrations, and works with the dual-database strategy (SQLite for dev, PostgreSQL for prod -- see ADR-002). The ORM must auto-generate types from the schema so that database changes propagate through the type system at compile time.

## Decision

Use Prisma v7 with the driver adapter pattern for database-agnostic access.

## Alternatives Considered

### Alternative 1: Drizzle ORM

- **Pros:** Lightweight, SQL-like syntax, good TypeScript types
- **Cons:** Newer ecosystem, fewer community resources, adapter pattern less mature
- **Why rejected:** Less mature migration tooling and smaller community for troubleshooting production issues

### Alternative 2: TypeORM

- **Pros:** Mature, supports many databases, decorator-based models
- **Cons:** Complex configuration, decorator syntax adds boilerplate, weaker type inference
- **Why rejected:** Type generation is inferior to Prisma's; decorator-heavy models are harder to maintain

### Alternative 3: Knex.js

- **Pros:** Flexible query builder, lightweight, raw SQL escape hatch
- **Cons:** No type generation, no schema-first workflow, manual type definitions
- **Why rejected:** No auto-generated types means manually maintaining type definitions that drift from the actual schema

## Consequences

### Positive

- Schema changes auto-generate TypeScript types via `prisma generate`
- Migration system tracks schema evolution with up/down scripts
- Adapter pattern enables the SQLite/PostgreSQL dual-database strategy
- Prisma Studio provides a GUI for inspecting dev data

### Negative

- Prisma adds a code generation step to the build pipeline
- Complex queries sometimes require raw SQL fallback (`$queryRaw`)

### Risks

- Prisma version upgrades can include breaking schema changes; mitigate by pinning versions and testing upgrades in a branch

## Compliance

| Standard | Impact |
|----------|--------|
| Database standards | Defines ORM and migration workflow |

## References

- [Prisma Documentation](https://www.prisma.io/docs)
- [ADR-002: SQLite/PostgreSQL strategy](adr-002-sqlite-to-postgres.md)

---

*Template: Ryvan Engineering System (RES) -- Cortex Growth / rynOne*
