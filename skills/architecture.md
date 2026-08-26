# Skill: Architecture

## Purpose

Preserve coherent boundaries while allowing the implementation to evolve through evidence.

## Architecture test

For every capability, answer:

1. Which bounded context owns the decision?
2. Which context owns the authoritative write?
3. Which data is local, referenced, cached, or derived?
4. Which synchronous calls are required?
5. Which facts can propagate asynchronously?
6. What happens when each dependency fails?
7. How is the behavior observed?
8. How is it rolled back or recovered?

If ownership cannot be stated in one sentence, the model is not ready.

## Layering

Within a service:

```text
domain
  ↑
application
  ↑
ports
  ↑
infrastructure and transport adapters
```

Dependencies point inward.

- Domain: entities, value objects, policies, domain errors.
- Application: use cases, transactions, ports, orchestration.
- Infrastructure: PostgreSQL, Redis, broker, object storage, clock, identifiers.
- Transport: GraphQL resolvers, event consumers, health and admin endpoints.

Framework types stop at adapters.

## Service boundary rule

A bounded context may begin as a deployable service because Federation is a core subject of the system. Internal modules still matter: a service is not permission to mix every concern.

Create a new deployable only when it has:

- distinct ownership;
- independent change or scaling pressure;
- a clear contract;
- an explicit failure mode;
- operational value that exceeds distribution cost.

## Data ownership

No cross-service table access. No shared ORM model package. Shared packages may define scalar contracts and event envelopes, not authoritative domain entities.

Read models may duplicate data if they define:

- source event;
- version;
- projection logic;
- staleness expectation;
- rebuild procedure;
- failure recovery.

## ADR triggers

Create an ADR for changes to:

- context boundaries;
- primary frameworks;
- persistence authority;
- event-delivery guarantees;
- consistency model;
- API style;
- state ownership;
- media delivery;
- security trust model;
- deployment topology;
- major operational dependency.

Do not use ADRs for routine implementation choices.
