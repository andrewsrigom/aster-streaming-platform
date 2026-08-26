# Engineering Principles

## 1. Correctness before cleverness

Prefer explicit state transitions, idempotency, and ownership to shortcuts that work only on the happy path.

## 2. Durable truth has one owner

A cached or projected copy may improve reads, but it does not become authoritative by convenience.

## 3. Distribution is a cost

A service boundary must justify network failure, deployment, observability, compatibility, and data-consistency costs.

## 4. Failure is part of behavior

Timeouts, retries, stale data, duplicate events, partial publication, and dependency outages are specified outcomes, not implementation surprises.

## 5. Bound every resource

Time, memory, concurrency, buffers, queues, pagination, fan-out, retries, cache size, media size, and telemetry cardinality need limits.

## 6. Optimize from evidence

Measure the user journey and the suspected bottleneck. Keep raw results and state limitations.

## 7. Security belongs at ownership boundaries

UI checks improve experience. Owner-side authorization protects data.

## 8. Accessibility is product behavior

Keyboard, captions, focus, semantics, and understandable errors are acceptance requirements.

## 9. Operability is part of implementation

A feature without telemetry, failure diagnosis, and recovery instructions is incomplete when it affects a critical journey.

## 10. Documentation describes reality

Planned architecture, current architecture, and scale-out architecture must be clearly separated.

## 11. Comments explain why

Use comments for invariants, external constraints, concurrency reasoning, and counterintuitive behavior. Let code explain ordinary mechanics.

## 12. Simple local development matters

A new contributor should be able to run the verified slice locally without paid infrastructure or hidden setup.
