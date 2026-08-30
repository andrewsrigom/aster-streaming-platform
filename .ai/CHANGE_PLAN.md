# Work Item: Phase 12 trace, correlation, privacy and exporter boundary

- Status: IN_PROGRESS
- Owner: Platform telemetry; each service transport and dependency adapter owns its spans
- Phase: 12
- Requirement IDs: P12-R01, P12-R02, P12-R08, P12-R09
- Created: 2026-08-30
- Updated: 2026-08-30

## Outcome

A current request or event can be followed through every applicable Aster
boundary using one repository-owned trace and structured-log contract. Names and
attributes remain finite and privacy-safe, and an absent, slow or failed
telemetry exporter never changes a product result, readiness or bounded
shutdown.

## Current behavior

P11-R10 is released at tree-identical main `834bf15`; exact-main run
`33296443777` passed every required job. Its exact executable correction
`aac04c7`, tree `c2a6c93`, passed Router4/4, platform67/67 and the complete
affected gate17/17. The guard rejects raw and YAML-decoded configuration
expansion inside the bounded traffic-shaping policy.

Rebased source commit `2cd63a3`, tree `b2bb86b`, implements the repository trace
contract locally. `@aster/telemetry` now owns bounded OpenTelemetry metrics and
traces, finite dimensions, active context, OTLP exporter health and timeout
behavior. All five owner HTTP servers create server spans and drive the existing
redacting logger context. Fixed owner clients inject child context; authenticated
Identity consumption links its producer; current database, Redis, broker,
object-storage and media-coordinator boundaries use finite dependency spans.
Focused telemetry, representative boundary and disposable-fixture contract
tests pass, and the final affected candidate gate passes73/73 with57 cached in
47.814 seconds. The branch remains unpublished and not verified until the hosted
disposable Collector candidate and protected review/CI pass. The single local
Collector attempt created no resources because
Docker reported no Linux engine; it will not be repeated unchanged.

## Proposed behavior

Add the smallest complete tracing vertical slice behind repository-owned
declarations: validated inbound/extracted and outbound/injected W3C context,
finite server/application/dependency/consumer/worker span names and attributes,
active context for correlated logs, bounded OTLP export, and explicit async
event links rather than indefinitely open request spans. Integrate it through
the shared HTTP and dependency adapter boundaries first, then current owner
event and media execution boundaries. Preserve Router sanitization and do not
add a hosted backend, dashboard, SLO or public trace identifier.

## Boundaries

- Owning context: Platform owns the telemetry contract; each bounded context owns operation outcome classification.
- Affected services/packages: `@aster/telemetry`, `@aster/runtime`, shared HTTP, PostgreSQL, Redis, broker and object-storage adapters, owner compositions, event delivery and media worker.
- Authoritative data: none; telemetry is diagnostic and never authoritative product state.
- Read models/caches: none.
- Trust boundaries: browser/Router headers, authenticated private subgraph transport, event envelopes, exporter endpoint and Collector output.
- External dependencies: accepted OpenTelemetry-compatible SDK/exporter and existing local Collector only.

## Invariants

- Domain and application layers import no OpenTelemetry SDK.
- Public trace, baggage, operation names and arbitrary attributes are untrusted.
- Metrics never label user, account, profile, title, request or trace IDs.
- Logs and spans contain no credentials, cookies, personal data, raw GraphQL documents or signed media URLs.
- Async events link to their producer context and do not keep request spans open.
- Export work has finite capacity, deadline, cancellation and shutdown behavior.
- Telemetry failure cannot alter product results, readiness or durable state.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Invalid inbound context | discard it and create a bounded local root after transport authentication | finite rejection reason, no hostile value |
| Exporter absent, slow or failed | product work completes; export fails within its deadline and records bounded local health | export result/drop counters and sanitized log |
| Span/attribute capacity exceeded | reject or truncate according to the fixed contract without allocating an unbounded queue | bounded drop reason |
| Event has no valid trace context | consumer creates a local root correlated by finite event context | stable consumer outcome only |
| Logger cannot obtain active context | write an otherwise valid uncorrelated entry | existing safe logger behavior |

## Data and contracts

- Schema/migration: none.
- GraphQL: no schema change; only authenticated internal W3C propagation remains.
- Events: existing envelope stays compatible; valid `traceparent` becomes an async link input.
- Cache: none.
- Compatibility: existing metric and logger declarations remain source-compatible; tracing types are repository-owned additions.
- Retention/deletion: no local retained trace backend in this slice; sampling/retention policy remains P12-R11.

## Security and privacy

- Authorization: trace context never grants owner, viewer or operator authority.
- Input limits: exact W3C format, finite header bytes, finite names/attributes/events/links and bounded exporter batching.
- Sensitive data: stable enumerations only; automated canaries cover tokens, cookies, IDs, documents and signed URLs.
- Abuse cases: forged parentage, baggage amplification, user-chosen span names, high-cardinality IDs, exporter backpressure and duplicate completion.

## Implementation steps

1. Inventory every current boundary and freeze the finite span/attribute vocabulary with privacy tests.
2. Add repository-owned trace/context/span declarations and a bounded OpenTelemetry adapter in `@aster/telemetry`.
3. Compose active context with `@aster/runtime` logs and shared inbound HTTP/outbound dependency adapters.
4. Link owner event consumption and bound media-worker spans without changing event or product contracts.
5. Prove Router-to-owner trace continuity, async links, redaction/cardinality and exporter outage/recovery.
6. Record exact evidence and update observability architecture and repository memory.

## Tests

- Domain: none; telemetry remains outside domain policy.
- Application: stable operation outcomes map to finite span status without SDK imports.
- Integration: real Collector trace export plus stopped/paused exporter recovery and bounded shutdown.
- Contract: W3C extraction/injection, async links, finite names/attributes and logger correlation.
- Browser: one sampled navigation/request correlation only if browser source changes.
- Performance/failure: bounded in-flight spans/export batches and exporter timeout; no capacity claim.

## Evidence

- Commands: focused telemetry/runtime/adapter suites, trace fixture, privacy/cardinality verifier and affected candidate gate.
- Raw artifact path: `evidence/phase-12/trace-contract.txt`, `trace-continuity.txt`, `exporter-failure.txt` and `cardinality-review.txt`.
- Acceptance result: every current boundary mapped; representative sync and async paths prove continuity; exporter failure remains isolated.
- Iteration gate: focused changed-package tests, typecheck, lint and privacy contract.
- Candidate gate: complete affected-scope gate plus one disposable Collector trace/failure fixture and documentation/AI checks.
- Heavyweight repeat triggers: trace/export/runtime composition changes repeat only the affected Collector path; prose-only changes repeat documentation/AI/format checks.
- Review stopping rule: one initial review and one confirmation; only requirement, privacy/security, boundedness, availability, evidence-integrity or public-contract blockers extend it.

## Rollback or recovery

Tracing is optional diagnostic infrastructure. Rollback disables the new
tracer/export composition and retains current metrics/logging; it changes no
database, event, object or product API. Disposable fixtures remove only their
exact Collector project resources.

## Documentation updates

- Observability architecture, telemetry vocabulary and Phase 12 evidence index.
- Repository state, queue, session log and handoff.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
