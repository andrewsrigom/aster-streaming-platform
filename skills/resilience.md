# Skill: Resilience

## Purpose

Make dependency failure bounded and predictable while avoiding retry amplification and hidden latency.

## Dependency policy record

For every synchronous dependency, document:

- critical or optional role;
- operation idempotency;
- deadline budget;
- timeout;
- retry conditions;
- maximum attempts;
- backoff and jitter;
- circuit-breaker scope;
- concurrency limit;
- fallback;
- telemetry;
- user-visible behavior.

## Policy order

A typical outbound policy is:

```text
request deadline
  └─ concurrency limit
      └─ circuit breaker
          └─ bounded retry
              └─ single attempt timeout
```

The exact order must be reasoned. A retry must not restart work after the overall deadline.

## Timeouts

- Connect, headers, body, and total execution may need different bounds.
- Preserve upstream deadline information.
- Cancel downstream work when the deadline expires.
- Do not choose timeouts solely from averages; inspect tail latency.

## Retries

Retry only transient failures and only when the operation is idempotent or protected by an idempotency key.

Use exponential backoff with jitter. Cap attempts and total delay. Respect server retry hints when trusted.

Do not retry validation, authorization, not-found, deterministic conflict, or permanent rights errors.

## Circuit breakers

Scope breakers by dependency and operation class, not globally across unrelated calls.

Record:

- failure signal;
- sampling window;
- minimum throughput;
- open duration;
- half-open probe count;
- fallback behavior.

A circuit breaker is not a substitute for timeouts or capacity limits.

## Bulkheads

Limit concurrency for expensive dependencies so one slow path cannot consume all process capacity. Define queue limit and rejection behavior; an infinite waiting queue is not resilience.

## Fallback

Fallback data must be:

- safe;
- clearly bounded in staleness;
- observable;
- semantically acceptable.

Example: trending titles may replace unavailable personalized recommendations. Authorization cannot fall back to allow.

## Failure laboratory

Every policy should be exercised through controlled latency, error, disconnect, and saturation scenarios defined in Phase 11.
