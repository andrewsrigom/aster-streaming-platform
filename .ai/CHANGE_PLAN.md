# Work Item: Structured Runtime Logging Baseline

- Status: IN_PROGRESS
- Owner: Aster runtime infrastructure
- Phase: 01
- Requirement IDs: P01-R04
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

Provide one reusable Node.js runtime package that emits newline-delimited structured JSON to standard output with stable service context, bounded application fields, representative secret redaction, and validated OpenTelemetry-compatible trace correlation. A focused diagnostic and tests make the behavior runnable before an HTTP service or telemetry backend exists.

## Current behavior

P01-R03 is released on `main` and validates the Phase 01 reference-runtime configuration before other initialization. No application logger, trace-correlation adapter, service runtime, OpenTelemetry SDK, log collector, or logging diagnostic exists.

## Proposed behavior

Create `@aster/runtime` with a repository-owned logging API backed by exact-pinned Pino `10.3.1`. The logger fixes service, environment, and version at initialization; accepts a bounded structured event contract; writes one JSON object per line; redacts a fixed reviewed set of sensitive keys; serializes errors without arbitrary messages; and reads optional trace and span IDs through an injected provider. The package will not install an OpenTelemetry SDK, HTTP logger, transport worker, pretty printer, or collector in this work item.

## Boundaries

- Owning context: Shared runtime infrastructure; no product bounded context owns or changes data.
- Affected services/packages: New `packages/runtime`; root task graph and dependency lock; no deployable service.
- Authoritative data: None. Log lines are diagnostic output and are not product records.
- Read models/caches: None.
- Trust boundaries: Logger construction options, per-call event fields, an injected active-trace provider, error objects, and the standard-output disclosure boundary.
- External dependencies: Pino `10.3.1` and its lockfile-resolved runtime dependencies; Node.js standard output. OpenTelemetry SDKs and log backends remain deferred to their owning Phase 01 items.

## Invariants

- Every emitted line is valid JSON with timestamp, level, service, environment, and version.
- Trace correlation is included only when both IDs satisfy OpenTelemetry/W3C lowercase non-zero hexadecimal requirements.
- Sensitive-key values, raw error messages, causes, stacks, tokens, cookies, credentials, personal identifiers, and signed URLs are never accepted as unrestricted output.
- Caller-controlled objects never become top-level logger bindings and cannot overwrite base, severity, timestamp, or correlation fields.
- Event names, identifiers, properties, strings, error chains, and collection traversal are bounded before serialization.
- A malformed trace provider or per-call record cannot throw into application work; it produces a bounded safe fallback or omits invalid optional context.
- The package has no product-domain rules and exposes no Pino type in its public declarations.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Invalid static logger options | Fail initialization with a stable cause-free runtime logging error | No log is claimed because logger initialization failed |
| Trace provider throws or returns malformed IDs | Emit the requested event without trace or span fields | Event remains identifiable by stable service and event context |
| Event record is malformed, excessive, or has hostile accessors | Do not propagate the failure; emit one bounded `aster.logging.invalid` record | Stable invalid-record reason without caller values |
| Sensitive property key is supplied | Replace its value with `[Redacted]` before output and retain Pino configuration redaction as defense in depth | Original value is absent from serialized output |
| Arbitrary error or cause chain is supplied | Emit bounded type and stable code/category only; omit raw message, stack, and arbitrary properties | Stable error category and bounded cause types |
| Standard-output destination rejects a synchronous write | Do not retry or block the request path; return a failed-write result without including the record | Export/drop metrics remain planned for the telemetry-owning item |

## Data and contracts

- Schema/migration: None.
- GraphQL: None.
- Events: Logging event names are operational records, not domain events.
- Cache: None.
- Compatibility: Repository-owned TypeScript declarations; Pino is an internal implementation detail. JSON field names remain stable for later Collector/Loki ingestion.
- Retention/deletion: The package writes to standard output only. Retention and deletion belong to the future collector/backend configuration.

## Security and privacy

- Authorization: Not applicable; the logger does not authorize product actions.
- Input limits: Bound static identity, event/operation/category/identifier lengths, property count and scalar size, error-cause depth, and provider output before serialization.
- Sensitive data: Redact reviewed credential keys case-insensitively after canonicalization; never serialize raw Error messages, stacks, request bodies, headers, GraphQL documents, configuration URLs, user/profile/title IDs, or signed media URLs through this baseline contract.
- Abuse cases: Prototype pollution, duplicate reserved fields, accessors/proxies that throw, circular or deep objects, oversized strings/collections, forged trace IDs, error-message disclosure, and output-field collision.

## Implementation steps

1. Record current Pino compatibility, maintenance, license, dependency, runtime-cost, security, and exit-strategy evidence.
2. Add `@aster/runtime` with repository-owned types, static option validation, bounded event normalization, sensitive-key redaction, sanitized error-chain conversion, and an injected trace-context provider.
3. Add a deterministic diagnostic that emits a correlated safe record and a representative redacted record to standard output.
4. Add direct and subprocess tests for JSON shape, levels, redaction, reserved-field isolation, trace validation, async context handoff, error sanitization, limits, hostile inputs, provider failure, and exit behavior.
5. Integrate package build, typecheck, tests, diagnostics, Knip entry points, documentation, and evidence into existing tasks without adding a commit hook or CI workflow.
6. Run focused checks, the complete forced graph, dependency/license/security review, clean-checkout verification, and protected pull-request review before marking the item done.

## Tests

- Domain: Not applicable; no product rules change.
- Application: Repository-owned logger contract and normalized event/error behavior with injected providers and destinations.
- Integration: Real Pino serialization to an in-memory destination plus spawned diagnostic output on pinned Node.js.
- Contract: Generated declarations contain no Pino type; every output line parses as JSON and preserves the documented stable field contract.
- Browser: Not applicable; this is a Node.js runtime package.
- Performance/failure: Bounded hostile inputs and an isolated process-cost observation; no benchmark claim. Provider and destination failure paths must not escape into the caller.

## Evidence

- Commands: Focused package build/test/diagnostic; strict typecheck, lint, formatting, unused-code and architecture checks; forced complete repository graph; audit, license inventory, secret scan, clean public checkout, protected CI, and automated review.
- Raw artifact path: `evidence/phase-01/runtime-logging.txt`.
- Acceptance result: Pending implementation and verification.

## Rollback or recovery

Remove the runtime package, its exact dependency and root task aliases, restore the lockfile, and revert only P01-R04 documentation and evidence references. Because the work owns no durable data, hosted resource, service, transport, or schema, rollback requires no migration or cleanup.

## Documentation updates

- Add the implemented runtime logging contract and diagnostic command to operations documentation and the root README.
- Record the selected Pino implementation and evidence in the technology baseline and decisions ledger.
- Update the observability architecture only where the concrete current behavior differs from its planned target.
- Update Phase 01 evidence index and repository memory without claiming a collector, OpenTelemetry SDK, service, or hosted retention.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
