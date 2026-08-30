# Work Item: Phase 12 bounded browser playback telemetry

- Status: IN_PROGRESS
- Owner: Web Playback
- Phase: 12
- Requirement IDs: P12-R04, P12-R11
- Created: 2026-08-30
- Updated: 2026-08-30

## Outcome

The player produces a deterministic, bounded and privacy-safe local account of
playback first-frame success and rebuffering. Every local playback attempt is
measured, observations live only for that player attempt, and retry or unmount
clears them explicitly. The repository documents that remote browser collection
is disabled, so no untrusted ingestion endpoint, durable browser record or field
QoE claim is created implicitly.

## Current behavior

P12-R03 and the backend portion of P12-R04 are released through PR46 exact head
`95e3a73`, protected run `33303267611`, clean confirmation, squash main
`2245251` and exact-main run `33304196111`.

The Web player already records eight finite event kinds in a maximum 64-entry
memory journal. The adapter measures the first decoded frame and completed
rebuffer intervals, and the Docker demo proves a real first frame. The journal
contains only relative bounded numbers and finite error categories. It has no
network transport or durable storage. Its retention, sampling and future
activation rules are not yet a complete policy. Disposal relies on garbage
collection, there is no aggregate first-frame outcome, and a pause or seek that
follows `waiting` can currently be counted as rebuffer time.

## Proposed behavior

Freeze one executable policy: sample every local attempt, keep at most 64 events
for the current attempt, retain nothing after retry/unmount, and sample zero
attempts for remote export. Add a finite summary that distinguishes pending,
successful and failed-before-first-frame attempts and reports bounded rebuffer
count/duration. Make player disposal erase the journal and aggregate. Cancel a
pending rebuffer on pause or seek and close it before a fatal failure. Display
the summary with the existing local diagnostic report.

## Boundaries

- Owning context: Playback owns media behavior; Web Playback owns ephemeral browser observations.
- Affected services/packages: `apps/web` only, plus Phase12 policy/evidence documents.
- Authoritative data: Playback session and media state remain authoritative; telemetry authorizes nothing.
- Read models/caches: none.
- Trust boundaries: untrusted media/browser events enter a finite local recorder; no browser telemetry crosses the network.
- External dependencies: existing browser media APIs and HLS.js only.

## Invariants

- No account, profile, title, session, request, trace, URL, manifest or signed-media value enters a sample or summary.
- Remote sampling remains zero and there is no telemetry transport or persistence.
- First-frame success requires an actual decoded-frame signal; metadata or session success is insufficient.
- Waiting before first frame, while paused or while seeking is not rebuffering.
- All counts, durations, event kinds and error kinds are finite and bounded.
- Measurement failure or disposal cannot change playback, progress, authorization or readiness.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Unsupported or invalid event detail | playback continues | omit the invalid detail or event |
| More than 64 valid events | playback continues | keep bounded aggregate and mark the journal truncated |
| Pause/seek during pending wait | preserve media behavior | cancel the pending rebuffer interval |
| Fatal error during pending wait | preserve existing failure handling | close bounded rebuffer time, then record finite failure |
| Retry or route unmount | preserve the new/current attempt only | erase prior journal and aggregate synchronously |
| Future remote transport is configured accidentally | no export path exists | remote sample rate remains zero |

## Data and contracts

- Schema/migration: none.
- GraphQL: none.
- Events: none.
- Cache: none.
- Compatibility: existing raw local samples remain available under an additive report summary.
- Retention/deletion: maximum 64 events and aggregates for one live player attempt; explicit erase on retry/unmount; zero server retention.

## Security and privacy

- Authorization: observations never grant or prove access.
- Input limits: fixed event/error vocabularies, 64 events, 24-hour duration ceiling, 4320-pixel rendition ceiling and bounded integer aggregate.
- Sensitive data: report shape cannot accept arbitrary keys; tests reject identifiers and URL canaries.
- Abuse cases: event floods, extreme clocks/durations, duplicate milestones, pause/seek inflation, late callbacks and accidental remote collection.

## Implementation steps

1. Add the executable policy, aggregate result and explicit lifecycle to the playback recorder.
2. Cancel false rebuffer intervals at adapter pause/seek boundaries and keep fatal intervals finite.
3. Bind recorder disposal to retry and player unmount; expose the aggregate in the local report.
4. Add focused state/adapter/browser coverage and privacy/retention canaries.
5. Publish the sampling, retention, activation and SLI-source policy; capture evidence and update repository memory.

## Tests

- Domain: not applicable; no domain rule changes.
- Application: recorder outcome, bounds, truncation, disposal and privacy tests.
- Integration: adapter decoded-frame, pause/seek, rebuffer, fatal and late-callback tests.
- Contract: executable sampling/retention constants match the documented policy.
- Browser: existing real playable first-frame journey plus local report shape if source changes require it.
- Performance/failure: bounded event flood and no post-disposal mutation; no capacity claim.

## Evidence

- Commands: focused Web tests/typecheck/lint, affected candidate gate and one browser/demo gate only if changed behavior invalidates prior browser evidence.
- Raw artifact path: `evidence/phase-12/browser-playback-telemetry.txt` and updated Phase12 index.
- Acceptance result: local attempts yield bounded first-frame/rebuffer outcomes; lifetime and zero remote export are explicit and enforced.
- Iteration gate: focused playback state/adapter tests plus Web typecheck and lint.
- Candidate gate: `pnpm check:changed` plus documentation/AI validation.
- Heavyweight repeat triggers: run the existing playable browser journey only when recorder/report/adapter behavior changes; do not rebuild media because media bytes and pipeline are unchanged.
- Review stopping rule: one initial review and one confirmation; extend only for requirement, privacy/security, measurement-integrity, availability or public-contract blockers.

## Rollback or recovery

Remove the additive summary/policy and lifecycle calls while retaining the
released local raw journal. No durable state, schema, object or remote telemetry
must be migrated or deleted.

## Documentation updates

- Browser playback telemetry policy and Web playback guide.
- Observability architecture, SLI source boundary and Phase12 evidence index.
- Repository state, queue, session log and handoff.

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass
- [ ] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
