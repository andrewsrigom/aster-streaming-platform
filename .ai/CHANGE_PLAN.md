# Work Item: Private controlled failure-injection laboratory

- Status: IN_PROGRESS
- Owner: Platform owns the laboratory; bounded-context owners retain product failure policy
- Phase: 11
- Requirement IDs: P11-R08, P11-R09
- Created: 2026-08-30
- Updated: 2026-08-30

## Outcome

Aster has deterministic, bounded development tooling that injects latency,
timeout, connection reset, selected HTTP error, malformed response, partial
stream, duplicate event and saturation without adding a production route or
letting request data select a fault. Every injected outcome is visibly tagged,
and the laboratory refuses production activation or non-loopback HTTP binding.

## Current behavior

P11-R05 passed its exact-head confirmation and protected CI, then PR42
squash-merged as main `59600aea669d34ec727c1f243d162608261295aa` with the
reviewed tree. Exact-main run `33290477608` passed every required job and
released P11-R05.
Existing focused tests create ad hoc loopback failures, and prior phases prove
specific Redis, broker, duplicate-event, saturation and worker failures. There
is no reusable controlled adapter, common tag or structural guard preventing a
future failure selector from entering production request composition.

## Proposed behavior

Add a tools-only TypeScript laboratory with two concrete adapters. A private
HTTP adapter binds only `127.0.0.1`, accepts one immutable scenario at
construction and injects bounded wire behavior. A duplicate-delivery adapter
delivers the same synthetic event exactly twice through an explicitly supplied
test handler. Both accept only `local` or `integration` environments, expose a
fixed visible injection tag and finite observations, and reject invalid bounds
before starting. No service, worker, router or web application imports the tool.

## Boundaries

- Owning context: Platform owns experiment mechanics; each bounded context owns interpretation and fallback.
- Affected services/packages: repository `tools/` and its policy tests only.
- Authoritative data: none; adapters use synthetic payloads and never write owner stores.
- Read models/caches: none.
- Trust boundaries: construction-time scenario configuration, loopback sockets, synthetic event handler and bounded observer callback.
- External dependencies: existing Node.js HTTP and test APIs only; no new package, image or hosted resource.

## Invariants

- Production activation fails before a listener or delivery is created.
- HTTP always binds to IPv4 loopback and exposes no fault-selection endpoint.
- Method, path, query, headers and body cannot change the construction-time mode.
- Delay, hold time, activation count, response status and body bytes are finite.
- Timeout and saturation holds have a laboratory-side terminal deadline.
- Reset and partial-stream scenarios close their exact socket; cleanup closes all retained sockets and timers.
- Duplicate delivery is exactly two bounded sequential calls with the same payload reference.
- Observations contain only the fixed injection tag, scenario label, mode, event and finite counters.
- Observer failure cannot change the injected transport or delivery outcome.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Invalid environment, label or bound | Refuse construction synchronously | typed validation issue |
| Attempted request-selected mode | Ignore request control and execute fixed scenario | fixed mode/tag observation |
| Latency | Delay then emit the configured bounded response | started/completed duration |
| Timeout | Hold until client cancellation or finite lab deadline | cancelled/deadline event |
| Reset | Destroy the accepted socket without a response | reset event |
| Selected error | Return an allowlisted status and bounded body | tagged response/error event |
| Malformed or partial response | Emit fixed invalid bytes or close after prefix | malformed/partial event |
| Saturation overflow | Hold the finite active set and reject excess immediately | active/rejected counters |
| Duplicate handler failure | Stop after the failing delivery and expose its index | delivery_failed event |
| Observer throws | Ignore observer failure and preserve the scenario | product-independent result |

## Data and contracts

- Schema/migration: none.
- GraphQL: none; the lab can sit behind existing private clients in later experiments.
- Events: synthetic generic payload only; no broker envelope or owner contract changes.
- Cache: none.
- Compatibility: additive repository test tooling; production artifacts and public contracts remain byte-identical.
- Retention/deletion: in-memory sockets, timers and bounded observations are disposed at laboratory close.

## Security and privacy

- Authorization: no public or private product request route is added.
- Input limits: fixed label vocabulary shape, body bytes, timing, activations, status allowlist and active capacity.
- Sensitive data: synthetic payloads only; observations exclude request headers, bodies, URLs, IDs and credentials.
- Abuse cases: production environment, public bind, request-selected fault, unbounded hang, unbounded queue and observer failure are rejected or contained.

## Implementation steps

1. Implement the private loopback HTTP and duplicate-delivery adapters with typed bounded configuration.
2. Test every required mode, fixed scenario selection, production refusal, visible tags, cancellation and cleanup.
3. Add the focused laboratory test to the normal source gate without adding a heavyweight per-commit job.
4. Document the trust boundary and create exact candidate evidence.
5. Run focused and affected gates, review once and publish one coherent candidate.

## Tests

- Domain: configuration bounds, finite mode/status/event vocabularies and immutable selection.
- Application: exactly-two duplicate delivery, ordered observations and handler/observer failures.
- Integration: real loopback latency, timeout cancellation, reset, error, malformed bytes, partial stream, saturation overflow and cleanup.
- Contract: production refusal, loopback-only address and fixed visible response/observation tags.
- Browser: not affected; no route or browser code changes.
- Performance/failure: coordinated saturation uses barriers rather than timing races and proves bounded active/rejected counts.

## Evidence

- Commands: focused Node test, root typecheck/lint/format, then `pnpm check:changed`.
- Raw artifact path: `evidence/phase-11/failure-injection.txt` and updated Phase 11 index.
- Acceptance result: source `53bb71b`, tree `750e003`, scenario matrix,
  observed wire/delivery outcomes and structural production isolation.
- Iteration gate: the new focused test plus TypeScript, ESLint and formatting on changed files.
- Candidate gate: complete affected-scope gate and repository-memory validators.
- Heavyweight repeat triggers: production composition or service imports require protected Docker proof; broker, database, Redis or worker mechanics defer to the game-day item and are not repeated for a tools-only change.
- Review stopping rule: one complete review and one confirmation; only requirement, injection-isolation, security, availability, data or public-contract blockers extend it.

## Rollback or recovery

Remove the tools-only module, its test and root test-script registration. No
service restart, schema rollback, durable data cleanup, cache flush, broker
offset change, media cleanup or credential rotation is required.

## Documentation updates

- Phase 11 evidence index, resilience architecture, environment policy, feature catalog and repository memory.

## Completion checklist

- [x] Requirements satisfied in the local candidate
- [x] Focused and affected tests pass
- [x] Candidate evidence captured
- [x] Documentation current for the candidate
- [x] `.ai/` state updated at the candidate checkpoint
- [x] Remaining review, protected CI and release risks recorded
