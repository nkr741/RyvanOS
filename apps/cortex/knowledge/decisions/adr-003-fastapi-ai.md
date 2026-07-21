# ADR-003: Why FastAPI for AI Services

## Status

Accepted

## Date

2026-07-14

## Context

Cortex Growth requires AI-powered features: survey summarization, lead scoring, follow-up generation. The Python ecosystem dominates AI/ML tooling (LangChain, OpenAI SDK, Anthropic SDK, scikit-learn, pandas). AI endpoints involve long-running tasks that benefit from async I/O. The AI service runs as a separate microservice behind the Next.js API layer.

## Decision

Use FastAPI as the framework for all AI/ML microservices.

## Alternatives Considered

### Alternative 1: Flask

- **Pros:** Simple, mature, large community
- **Cons:** No native async support, manual OpenAPI spec, no built-in validation
- **Why rejected:** Async is essential for concurrent AI API calls; Flask requires Celery or similar for non-blocking work

### Alternative 2: Django + DRF

- **Pros:** Full-featured, ORM included, admin panel
- **Cons:** Heavy for a microservice, ORM is unnecessary (Prisma owns the database), slow startup
- **Why rejected:** Too much framework for a focused AI service; we don't need Django's ORM or admin

### Alternative 3: Node.js (Express/Fastify)

- **Pros:** Same language as frontend, good async model
- **Cons:** Python AI/ML libraries have no Node.js equivalents; would require bridging or reimplementation
- **Why rejected:** ML ecosystem is overwhelmingly Python; using Node.js would mean fighting the toolchain

## Consequences

### Positive

- Native async/await for parallel AI API calls
- Auto-generated OpenAPI docs for the Next.js frontend to consume
- Direct access to the entire Python AI/ML ecosystem
- Pydantic models provide runtime validation of AI inputs/outputs

### Negative

- Two languages in the stack (TypeScript + Python) increases cognitive overhead
- Deployment pipeline must handle both runtimes

### Risks

- Python service becomes a bottleneck if not properly scaled; mitigate with horizontal scaling and async task queues

## Compliance

| Standard | Impact |
|----------|--------|
| AI service standards | Defines framework and patterns for all AI endpoints |

## References

- [FastAPI Documentation](https://fastapi.tiangolo.com/)

---

*Template: Ryvan Engineering System (RES) -- Cortex Growth / rynOne*
