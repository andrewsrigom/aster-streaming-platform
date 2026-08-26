# Engineering Demonstration Contract

## Purpose

Aster is complete only when its engineering choices can be explained, exercised, measured, and operated through the product. A library installation, isolated example, passing happy-path test, or architecture diagram does not demonstrate the corresponding engineering subject.

This contract maps the required subjects to their implementation phases and defines the local checkpoints that make progress observable without changing the ordered phase gates.

## Demonstration standard

Each engineering subject must eventually have all of the following:

1. **Explanation** — the relevant handbook describes the model, invariants, trade-offs, and failure modes.
2. **Implementation** — production-shaped code exercises the subject inside an owned product capability.
3. **Adverse verification** — tests cover malformed input, dependency failure, concurrency, stale state, cancellation, or abuse where applicable.
4. **Measurement** — representative experiments record commands, workload, environment, raw results, interpretation, and limitations.
5. **Operation** — telemetry and recovery guidance show how to detect and respond to failure.

A phase may establish a baseline before later phases provide representative workloads or final acceptance. The earlier phase must not claim final verification on behalf of the later phase.

## Coverage matrix

| Engineering subject | Explanation | Implementation phases | Final evidence |
|---|---|---|---|
| Node.js production behavior | [`01-node-in-production.md`](../handbook/01-node-in-production.md) | 01 runtime lifecycle; 06 streams and FFmpeg process control; 11 bounded failure; 14 event-loop and memory diagnosis | startup/shutdown traces, event-loop and memory metrics, stream/backpressure tests, load profiles, heap or CPU artifacts when indicated |
| Domain-driven design, Clean Architecture, and layers | [`02-domain-and-clean-architecture.md`](../handbook/02-domain-and-clean-architecture.md) | 00 import boundaries; 02 Identity policies; 03 Catalog lifecycle; 07 Playback; 08 Engagement ordering | architecture-rule failure fixture, domain and application tests, ownership review, migration and contract evidence |
| Resilience | [`03-resilience.md`](../handbook/03-resilience.md) | 01 deadline and shutdown baseline; 11 policies and failure laboratory; 14 game days | timeout, cancellation, retry-safety, breaker, bulkhead, load-shedding, recovery, and runbook evidence |
| Redis caching and concurrency | [`04-redis.md`](../handbook/04-redis.md) | 01 bounded adapter baseline; 10 measured cache and coordination patterns; 11 outage behavior; 13 GraphQL calibration | cache baseline, stampede, TTL jitter, atomic limiter, outage, degraded-mode, and source-load evidence |
| Observability, service-level indicators, and service-level objectives | [`05-observability-and-slos.md`](../handbook/05-observability-and-slos.md) | 01 telemetry baseline; 07 playback experience signals; 12 end-to-end acceptance; 14 operational readiness | correlated logs, traces, metric queries, SLI definitions, SLOs, burn alerts, and linked runbooks |
| GraphQL and Apollo Federation v2 | [`06-federation-v2.md`](../handbook/06-federation-v2.md) | 02 and 03 subgraphs; 04 Router and composition; 08 and 09 entity extensions; 13 hosted operation controls | composed schema, compatibility checks, query plans, identity-context protection, entity batching, and partial-failure traces |
| GraphQL performance and security | [`07-graphql-performance-and-security.md`](../handbook/07-graphql-performance-and-security.md) | 04 safe baselines; 08 request-scoped DataLoader; 13 cost and abuse acceptance | SQL query counts, N+1 comparison, trusted-operation manifest, body/parser/depth/alias/list/cost/deadline/concurrency tests, and authorization matrix |
| Server-side rendering and hydration | [`08-ssr-and-hydration.md`](../handbook/08-ssr-and-hydration.md) | 05 web shell and browser verification | raw server HTML, safe Apollo snapshot, zero hydration warnings, no duplicate initial operation, locale and slow-JavaScript checks |
| Apollo Client and Redux Toolkit | [`09-apollo-client-and-redux.md`](../handbook/09-apollo-client-and-redux.md) | 05 ownership baseline; 07 player interaction; 08 durable engagement integration | cache policies, request-scoped stores, state-ownership review, focused selector measurements, mutation rollback, and browser tests |
| Media streaming and system design | [`10-media-streaming-and-system-design.md`](../handbook/10-media-streaming-and-system-design.md) | 03 publication fixture; 06 ingest and HLS; 07 playback; 14 capacity | rights record, immutable object manifest, FFmpeg recipe, atomic publication, CDN-compatible delivery path, first-frame and rebuffer evidence |

The detailed experiment ownership remains in the [`Experiment Catalog`](../quality/EXPERIMENT_CATALOG.md).

## Progressive local checkpoints

The phases remain ordered. Each checkpoint extends the same repository and local execution path.

| Closed phase | Demonstrable checkpoint |
|---:|---|
| 00 | A clean checkout installs deterministically and passes the documented repository gates. |
| 01 | A Docker-based runtime laboratory starts without hosted credentials, reports dependency readiness, emits baseline telemetry, and shuts down with a bounded drain. |
| 02 | A deterministic synthetic account can obtain a local session and exercise owner-authorized profile behavior without a hosted identity account. |
| 03 | The local seed exposes a rights-shaped synthetic catalog title and a small technically valid HLS fixture. |
| 04 | First-party GraphQL operations traverse Apollo Router and the composed Identity and Catalog subgraphs. |
| 05 | The browser renders and hydrates the public catalog and title routes from a clean local start. |
| 06 | An approved source can be processed, validated, stored immutably, and atomically published by the media worker. |
| 07 | The Docker-only demo starts from empty local state and plays a validated HLS publication with captions, quality behavior, and classified recovery paths. |
| 08 | The same demo persists ordered progress, watchlist, history, and continue-watching behavior. |
| 09 | Home rails and search work while Discovery failure degrades without blocking catalog or playback. |
| 10 | A cache laboratory compares uncached and cached paths and demonstrates stampede, limiter, and Redis-outage behavior. |
| 11 | A failure laboratory exercises deadlines, retries, breakers, bulkheads, load shedding, fallbacks, and recovery. |
| 12 | An operations laboratory follows browse and playback through logs, metrics, traces, dashboards, SLOs, alerts, and runbooks. |
| 13 | A GraphQL abuse laboratory demonstrates N+1 control, trusted operations, demand limits, and owner-side authorization. |
| 14 | The released system has capacity, soak, failure, backup, restore, rollback, and operational-readiness evidence. |

## Local execution lanes

### Development lane

The development lane may run Node.js applications on the host for fast feedback while versioned dependencies run in containers. Repository scripts remain the canonical interface after Phase 00 implements them.

### Docker-only demo lane

The demo lane must require only Git, a supported container runtime with Compose, and a browser. It must:

- start the verified slice with one documented command;
- build or pull only version-pinned images;
- wait for health and one-shot migration or seed jobs instead of relying on timing;
- use synthetic identities and media fixtures without hosted credentials;
- print the application URL and diagnostic command;
- support an explicit, project-scoped cleanup command;
- fail with a diagnosable dependency or resource reason;
- record startup duration, image and volume footprint, and idle resource use before a checkpoint is called verified.

Phase 00 defines this interface and its safety requirements. Phase 01 selects and verifies the exact runtime-laboratory command and supported Compose version. Phase 07 owns the first playable clean-start acceptance.

### Laboratory lane

Resource-heavy dependencies and experiments use named Compose profiles or one-shot commands. A contributor should not need to run the broker, full telemetry stack, failure laboratory, media transcode, browser suite, and load suite for every edit.

## Scope and time discipline

- Identity remains a real trust boundary. The initial adapter must support deterministic local sessions and owner-side authorization, but public signup, password recovery, multi-provider social login, and broad account UI are outside the initial scope.
- Commodity web primitives should come from a small, validated accessible source rather than a bespoke design system. Every adopted component must have a concrete use case.
- Player controls may use a compatible media-control primitive, but HLS lifecycle, accessibility, captions, quality selection, error classification, and telemetry remain Aster acceptance responsibilities.
- Synthetic fixtures accelerate deterministic startup; they do not replace integration tests against real PostgreSQL, Redis, object storage, broker, Router, or browser behavior where those semantics matter.
- A checkpoint may be convenient to run without weakening the evidence required to close its phase.

## Completion rule

The roadmap is not complete because the final page renders or a video plays. Completion requires every row in the coverage matrix to have its phase-owned implementation and evidence, every required checkpoint to pass from the documented environment, and Phase 14 to satisfy its release gate.
