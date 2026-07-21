# ADR-004: Why Event-Driven Architecture

## Status

Accepted

## Date

2026-07-14

## Context

Cortex Growth's survey completion triggers multiple downstream actions: lead scoring, AI summary generation, follow-up scheduling, CRM sync, and notification dispatch. Tight coupling between these actions creates fragile call chains. As the system grows into microservices, components need decoupled communication. The architecture must support both the current monolith and a future distributed system.

## Decision

Adopt event-driven architecture principles. Currently implemented as direct function calls within the monolith, but designed for extraction to NATS messaging when services are split.

## Alternatives Considered

### Alternative 1: Direct Service-to-Service HTTP Calls

- **Pros:** Simple, easy to debug, familiar
- **Cons:** Tight coupling, cascading failures, synchronous blocking
- **Why rejected:** Adding a new downstream action requires modifying the caller; this does not scale with feature growth

### Alternative 2: RabbitMQ

- **Pros:** Mature, reliable, good tooling
- **Cons:** Heavier operational overhead, complex routing setup for our scale
- **Why rejected:** NATS is lighter-weight and better suited to our cloud-native deployment model

### Alternative 3: Kafka

- **Pros:** High throughput, event replay, strong ordering guarantees
- **Cons:** Significant infrastructure complexity, overkill for our current volume
- **Why rejected:** Operational complexity is not justified at our scale; NATS JetStream covers our durability needs

## Consequences

### Positive

- New downstream actions can subscribe to events without modifying existing code
- Services can fail independently without cascading failures
- Event log provides an audit trail of system activity
- Current monolith code is structured for clean extraction

### Negative

- Eventual consistency replaces immediate consistency for some workflows
- Debugging event chains is harder than tracing synchronous calls

### Risks

- Premature extraction to NATS before the boundaries are stable; mitigate by extracting only when a service has proven its domain boundary in the monolith

## Compliance

| Standard | Impact |
|----------|--------|
| Architecture standards | Defines inter-service communication patterns |

## References

- [NATS Documentation](https://docs.nats.io/)

---

*Template: Ryvan Engineering System (RES) -- Cortex Growth / rynOne*
