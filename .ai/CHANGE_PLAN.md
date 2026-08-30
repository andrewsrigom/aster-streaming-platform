# Work Item: Operation-scoped Catalog circuit breakers

- Status: IN_PROGRESS
- Owner: Platform owns the state machine; Playback and Discovery own policy instances and outcomes
- Phase: 11
- Requirement IDs: P11-R05, P11-R07, P11-R11
- Created: 2026-08-29
- Updated: 2026-08-29

## Outcome

Playback publication reads and Discovery snapshot/export reads stop repeatedly
calling an unhealthy Catalog operation after a measured local failure threshold.
Each dependency/operation class owns an independent closed/open/half-open state,
permits one recovery probe, emits bounded telemetry and preserves the existing
rights-safe failure or optional stale-projection behavior.

## Current behavior

P11-R01 is released as `ebdcb18` after exact-head review, protected CI and
successful exact-main run `33285339274`. The fixed owner reads already have parent-bounded deadlines,
one selected-transient retry and finite concurrency. Repeated failures still
reach Catalog on every admitted logical call; the registry correctly labels
their breakers as planned.

## Proposed behavior

Add a framework-free runtime circuit breaker using a bounded 30-second rolling
sample window, minimum throughput four, failure-rate threshold 50%, five-second
open interval and one half-open probe. A generation fence prevents completions
from calls admitted before an open transition from mutating the newer state.
Monotonic time and observation are injected and hostile policy/time/observer
behavior remains finite.

Create distinct long-lived instances for Playback publication, Discovery
snapshot and Discovery export. One logical safe-read result contributes one
breaker result: validated owner completion is success, owner unavailable or
invalid response is failure, and caller cancellation is ignored. Local input or
bulkhead rejection occurs before breaker accounting. Open or occupied half-open
state makes no network attempt.

Record finite breaker state/event metrics. Playback remains fail closed and
never creates a session without current Catalog authority. Discovery does not
fabricate owner data; its already-validated active projection remains the only
optional stale source.

## Boundaries

- Owning context: Catalog owns publication/snapshot truth; consumers own their local protection policy.
- Affected services/packages: `packages/runtime`, `packages/telemetry`, Playback and Discovery Catalog clients.
- Authoritative data: unchanged Catalog publications and snapshots.
- Read models/caches: existing Discovery projection only; no new cache or copied authority.
- Trust boundaries: fixed private HTTP responses, cancellation, injected monotonic time and finite telemetry dimensions.
- External dependencies: existing Node HTTP and OpenTelemetry packages only.

## Invariants

- Breakers are scoped by dependency and operation class, never global.
- Breaker admission remains inside the existing logical-operation bulkhead and outside retry attempts.
- A retry contributes one logical breaker outcome, not one failure per attempt.
- Open Playback behavior never allows playback, authorization or rights fallback.
- Discovery can retain only an already-valid projection; breaker rejection creates no data.
- Exactly one half-open probe runs; other callers reject without a queue.
- Late completions from an older generation cannot close or reopen newer state.
- Metric attributes come only from fixed vocabularies and contain no IDs, URLs, queries or credentials.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Fewer than four measured calls | Remain closed | finite success/failure events |
| At least 50% failures in four or more 30-second samples | Transition closed to open | `opened` in `open` state |
| Call during five-second open interval | Reject without HTTP | `rejected_open` |
| First call after open interval | Transition to half-open and run one probe | `half_opened` |
| Concurrent half-open call | Reject without queue or HTTP | `rejected_half_open` |
| Probe succeeds | Reset samples and close | `closed` |
| Probe fails or is inconclusive | Reopen for a fresh interval | `reopened` |
| Caller cancellation | Return cancelled and do not poison closed samples | `ignored` when admitted |
| Clock/observer/action defect | Remain finite; observer cannot affect product result | bounded failure/rejection |

## Data and contracts

- Schema/migration: none.
- GraphQL: public and private documents unchanged.
- Events: none.
- Cache: none; existing Discovery stale validation is unchanged.
- Compatibility: additive runtime and telemetry APIs; owner client return unions unchanged.
- Retention/deletion: bounded in-memory samples only; no durable state.

## Security and privacy

- Authorization: Catalog remains authoritative; breaker rejection never allows access.
- Input limits: existing identifiers, response bytes, concurrency and deadlines remain.
- Sensitive data: telemetry has fixed dependency/operation/state/event values only.
- Abuse cases: open-state callers cannot create a queue or recovery-probe herd.

## Implementation steps

1. Record the state-machine policy in ADR-0041 and update the dependency registry.
2. Implement and adversely test the bounded runtime breaker.
3. Add finite circuit-breaker telemetry and contract tests.
4. Integrate independent Playback publication and Discovery snapshot/export instances.
5. Prove open rejection, one half-open probe, recovery, operation isolation and unchanged authority behavior.
6. Run focused and affected gates, capture evidence, review once and publish the coherent candidate.

## Tests

- Domain: rolling-window threshold/pruning and closed/open/half-open transitions.
- Application: success/failure/ignored accounting, generation fencing and one probe.
- Integration: real loopback HTTP opens, rejects without a request, recovers and keeps operation scopes independent.
- Contract: finite telemetry validation/collection and registry values.
- Browser: not affected; protected Docker gate remains the composition check.
- Performance/failure: deterministic burst proves failure amplification stops after the threshold.

## Evidence

- Commands: runtime/telemetry/client focused builds and tests, then `pnpm check:changed`.
- Raw artifact path: `evidence/phase-11/circuit-breakers.txt` and updated Phase 11 index.
- Acceptance result: exact source, measured calls/transitions and collected metric series.
- Iteration gate: affected package build/tests plus TypeScript, lint and formatting on changed files.
- Candidate gate: complete affected-scope gate and repository-memory validators.
- Heavyweight repeat triggers: wire/admission changes repeat loopback tests; service composition changes are covered by protected Docker CI; no local media or load experiment without affected behavior.
- Review stopping rule: one complete review and one confirmation; only requirement, authority, availability, security, data or public-contract blockers extend it.

## Rollback or recovery

Remove the three local breaker instances and retain safe-read deadlines/retries.
No schema, durable data, credential, cache, event, media or infrastructure reset
is needed. A process restart also resets only the bounded in-memory samples.

## Documentation updates

- ADR-0041, dependency registry, resilience architecture and failure modes.
- Playback/Discovery service notes, Phase 11 evidence and repository memory.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
