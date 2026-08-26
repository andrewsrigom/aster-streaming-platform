# Work Item: Define the Bounded Telemetry Contract and Runtime Metrics

- Status: IN_PROGRESS
- Owner: Aster shared telemetry and runtime infrastructure
- Phase: 01
- Requirement IDs: P01-R06
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

Provide one repository-owned telemetry package that exposes bounded Node.js runtime, HTTP, dependency, and export-health metrics without leaking OpenTelemetry SDK types to service, transport, domain, or application code. The package must remain useful without a Collector, fail safely when export is unavailable, integrate with the existing lifecycle flush stage, and prove that caller-controlled values cannot create high-cardinality series or disclose sensitive data.

## Current behavior

`@aster/runtime` provides structured Pino-compatible logs, validated trace correlation through a repository-owned context provider, stable lifecycle events, and a bounded `flushTelemetry` shutdown hook. No OpenTelemetry API or SDK dependency, metric provider, runtime collector, exporter, metric reader, Collector, scrape endpoint, dashboard, alert, or drop signal exists.

P01-R05 is released through protected squash `4d243351bb46ae6b63a80a9ca3b9186baa3c68ac`; exact post-merge run `33004926766` passed every applicable job. This branch starts from that clean released `main` head.

## Proposed behavior

Create `@aster/telemetry` as the only package that imports selected OpenTelemetry API, metrics SDK, instrumentation, or exporter modules. It exposes repository-owned options, metric recorders, lifecycle hooks, stable finite dimension types, and sanitized result categories. Runtime collection covers event-loop delay and utilization, garbage collection, heap and process memory, process CPU, uptime, and bounded active-resource observations. Explicit HTTP and dependency recorders cover duration, concurrency, and stable outcomes.

Use an in-memory reader for deterministic tests and one optional periodic OTLP/HTTP path with finite interval and export timeout. Export failure must not fail product work or readiness. The implementation exposes a stable export-failure/drop observation and bounded `forceFlush` plus shutdown hooks that compose with P01-R05. A real Collector, Prometheus scrape, dashboard, SLO, product metric, service composition, and dependency adapter remain outside this item.

## Boundaries

- Owning context: Shared telemetry and runtime infrastructure; no product bounded context or durable data owner changes.
- Affected services/packages: New `@aster/telemetry`; workspace and lockfile; documentation, Phase 01 evidence, and repository memory. Existing runtime or HTTP packages change only if a narrow repository-owned metric seam is required and proven.
- Authoritative data: Process-local counters, histograms, gauges, collection state, and exporter health. They are operational observations, not authoritative product data.
- Read models/caches: None. Metric aggregation is bounded ephemeral state, not a product cache.
- Trust boundaries: Constructor configuration, service identity, HTTP route/method/status categories, dependency/operation/outcome categories, Node.js performance observers, active-resource names, clocks, metric reader/exporter behavior, OTLP endpoint configuration, cancellation, and lifecycle flush/shutdown.
- External dependencies: Exact OpenTelemetry packages selected after current registry, license, engine, dependency, API-stability, and Node.js `24.19.0` compatibility evidence. No container or hosted resource is added.

## Invariants

- Domain, application, service, and transport contracts import no OpenTelemetry SDK or exporter type.
- Metric names, units, descriptions, bucket boundaries, and allowed attributes are explicit and stable.
- Caller-controlled identifiers, URLs, query text, GraphQL documents, headers, exception messages, credentials, trace IDs, span IDs, request IDs, and object keys never become metric attributes.
- Service and environment values come only from already validated process configuration.
- Dependency, operation, route, method, outcome, status, runtime-resource, and export-result values use finite reviewed sets or fail closed to one bounded fallback.
- Recording and instrument creation do not require a Collector or network connection.
- HTTP and dependency active counts cannot become negative; each acquired observation completes at most once.
- Periodic export, force flush, and shutdown have finite deadlines and cannot block request correctness, readiness, or the lifecycle deadline.
- Export failure and dropped observations are observable without recursively exporting unbounded failure telemetry.
- Runtime observers, timers, and readers are owned once, idempotently stopped, and release their event-loop resources.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Missing, accessor-backed, excessive, or invalid options | Fail construction before installing observers, timers, or exporters with one bounded cause-free issue set | Sanitized initialization result only |
| Unknown route, method, dependency, operation, outcome, or resource value | Reject or map to one documented bounded fallback; never create a caller-named series | Stable invalid-observation result |
| Duplicate completion of HTTP or dependency observation | Return an unchanged result without decrementing active state twice | No duplicate duration/count |
| Runtime observer or synchronous collection throws | Preserve product work, classify the collector, and allow later collection or shutdown | Stable collector failure category |
| Exporter rejects, times out, or Collector is unreachable | Bound the attempt, record stable failure/drop state, and continue product work and readiness | Export result and bounded dropped-observation count |
| Exporter ignores cancellation or never settles | Lifecycle deadline remains authoritative; shutdown returns without awaiting the exporter forever | Timeout/drop category when locally observable |
| `forceFlush` or shutdown called concurrently/repeatedly | Share one bounded provider operation while each waiter retains caller-local cancellation; close the provider once | One stable result per caller without duplicate provider work |
| Clock moves backward or supplies invalid duration | Reject the observation or clamp only according to an explicit tested rule | Stable invalid-duration category |
| Active-resource inventory exceeds its ceiling | Aggregate overflow into one bounded category; never emit arbitrary resource names | Stable overflow resource series |

## Data and contracts

- Schema/migration: None.
- GraphQL: None.
- Events: None.
- Cache: None.
- Public telemetry API: Repository-owned immutable options, finite metric dimensions, HTTP/dependency observation leases, runtime collection lifecycle, export health snapshot, and bounded flush/shutdown hooks.
- Compatibility: Generated declarations contain no OpenTelemetry SDK, OTLP exporter, Express, Apollo, PostgreSQL, Redis, broker, object-storage, or product-domain types. The package supports pinned Node.js `24.19.0`.
- Retention/deletion: Process-local aggregation is released on shutdown. Backend retention remains unimplemented until P01-R09/P01-R10.

## Security and privacy

- Authorization: None; this package exposes no public endpoint. Future scrape and health exposure retain their owning authorization and network boundary.
- Input limits: Bound option keys, string lengths, registered operation/route inventory, attribute sets, histogram boundaries, collection interval, exporter timeout, active observation count, active-resource categories, and exporter failure accounting.
- Sensitive data: Never read or emit request bodies, headers, documents, tokens, cookies, emails, profile/account/title identifiers, endpoints with credentials, signed URLs, errors, stacks, or arbitrary caller objects.
- Abuse cases: Hostile metric labels causing memory growth, accessor execution, series explosion, negative active counts, duplicate completion, recursive export-failure telemetry, stalled export preventing shutdown, and fake runtime values corrupting instruments.

## Implementation steps

1. Select the smallest exact OpenTelemetry dependency set from current official compatibility, stability, license, engine, transitive, audit, and removal-path evidence.
2. Define finite repository-owned metric vocabulary, validation, public result types, and deterministic clock/reader seams in `@aster/telemetry`.
3. Implement HTTP and dependency duration/concurrency/outcome recorders with one-shot completion and cardinality controls.
4. Implement Node.js runtime collection with bounded observer ownership, resource classification, start/stop behavior, and deterministic tests.
5. Add optional in-memory and bounded OTLP/HTTP composition, export health/drop behavior, and lifecycle-compatible flush/shutdown hooks.
6. Add declaration-isolation, hostile-input, unavailable-exporter, timer/handle cleanup, and Node.js compatibility diagnostics.
7. Update observability/runtime documentation, dependency decisions, evidence, state, queue, session log, and handoff at candidate and closeout checkpoints.

## Tests

- Domain: None; no product domain rule changes.
- Application: Pure recorder tests for finite vocabulary, one-shot completion, active counts, duration/outcome mapping, overflow aggregation, and hostile values.
- Integration: In-memory OpenTelemetry reader and a loopback unreachable/stalled OTLP endpoint; no Collector container.
- Contract: Metric names, units, descriptions, attributes, histogram boundaries, generated declarations, package exports, and lifecycle hook shape.
- Browser: Not applicable.
- Performance/failure: Bounded runtime observer start/stop, event-loop delay observation, GC/heap/process collection compatibility, exporter timeout, concurrent flush/shutdown, no live timer/observer after stop, no unhandled rejection, and no high-cardinality labels.

## Evidence

- Commands: Exact package typecheck/build/test/check, targeted lint/format, diagnostic, `pnpm check:changed`, one stabilized complete `pnpm check --force`, `pnpm audit --audit-level=high`, dependency/license inventory, and exact clean checkout when the final dependency/lockfile/public-package contract stabilizes.
- Raw artifact path: `evidence/phase-01/runtime-telemetry.txt`.
- Acceptance result: Pending.
- Iteration gate: Focused `@aster/telemetry` typecheck/build/test/check plus targeted lint and format after each coherent behavior slice.
- Candidate gate: `pnpm check:changed` after the package contract, runtime collection, and export failure path form one complete candidate; one forced complete graph before publication.
- Heavyweight repeat triggers: Repeat clean checkout for dependency, lockfile, workspace, packaging, generated-declaration, install-script, or public-command changes. Repeat runtime/handle and unreachable-exporter diagnostics for observer, timer, reader, exporter, flush, or shutdown changes. P01-R06 adds no Docker path, so container evidence is not applicable.
- Review stopping rule: One complete review and one confirmation. Additional review only if remediation changes or reveals a requirement, security/data invariant, availability behavior, metric public contract, or cardinality boundary.

## Rollback or recovery

Remove `@aster/telemetry`, its exact OpenTelemetry dependencies, lockfile entries, documentation, and tests. Stop and shut down any created provider before replacement. Existing logs, lifecycle, Express transport, product data, Docker resources, and hosted settings remain unchanged. Export outage recovery is to keep local bounded recording operational, preserve readiness, and restore the optional exporter without replaying unbounded observations.

## Documentation updates

- Document the exact metric catalog, units, dimensions, bucket rationale, runtime collection ownership, export lifecycle, failure behavior, privacy exclusions, and operational limitations.
- Record dependency compatibility, license, audit, Node.js runtime, timer/handle, in-memory collection, and unreachable-exporter evidence.
- Update `docs/architecture/OBSERVABILITY_ARCHITECTURE.md`, `docs/architecture/RUNTIME_PLATFORM_RUNWAY.md`, the Phase 01 specification/evidence index, repository dependency documentation, and `.ai/` memory without claiming a Collector, scrape path, dashboard, SLO, or product service.

## Completion checklist

- [x] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
