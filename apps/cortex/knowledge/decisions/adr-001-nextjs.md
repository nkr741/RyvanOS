# ADR-001: Why Next.js

## Status

Accepted

## Date

2026-07-14

## Context

Cortex Growth needs a full-stack web framework that supports server-side rendering for SEO on public-facing pages, nested layouts via App Router, built-in API routes for rapid prototyping, and a TypeScript-first developer experience. The BDE team needs fast iteration cycles and access to a large package ecosystem.

## Decision

Use Next.js 16 with App Router and Turbopack as the primary web framework.

## Alternatives Considered

### Alternative 1: Remix

- **Pros:** Excellent data loading patterns, web-standards-first
- **Cons:** Smaller ecosystem, fewer deployment targets, less mature App Router equivalent
- **Why rejected:** Ecosystem size and community momentum favor Next.js for our team's velocity

### Alternative 2: Vite + React

- **Pros:** Fast dev server, lightweight, flexible
- **Cons:** No built-in SSR, no file-based routing, requires assembling middleware and API layer manually
- **Why rejected:** Too much assembly required; we need batteries-included for a small team

### Alternative 3: Nuxt (Vue)

- **Pros:** Strong SSR support, good DX
- **Cons:** Vue ecosystem is smaller for enterprise tooling, team has stronger React experience
- **Why rejected:** Team skill alignment and React ecosystem breadth

## Consequences

### Positive

- SSR out of the box for SEO-critical pages
- App Router provides nested layouts, loading states, and error boundaries
- API routes eliminate the need for a separate backend during prototyping
- Turbopack cuts dev server startup and HMR to sub-second

### Negative

- Vendor lock-in to Vercel's conventions (mitigated by self-hosting option)
- App Router patterns are still evolving; some community libraries lag behind

### Risks

- Major Next.js version upgrades can be disruptive; mitigate by pinning versions and testing upgrades in CI

## Compliance

| Standard | Impact |
|----------|--------|
| Frontend standards | Defines framework conventions for all UI code |

## References

- [Next.js Documentation](https://nextjs.org/docs)

---

*Template: Ryvan Engineering System (RES) -- Cortex Growth / rynOne*
