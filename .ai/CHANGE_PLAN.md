# Work Item: Clarify Router, Web, and quality-gate flows

- Status: IN_PROGRESS
- Owner: Router, Web, and repository governance
- Phase: 14
- Requirement IDs: P14-R16, P13-R03, P13-R04, P13-R05, P07-R05, P07-R07, P07-R10, P00-R06
- Created: 2026-09-02
- Updated: 2026-09-02

## Outcome

A reader can follow GraphQL demand analysis, playback-session creation and
recovery, and quality-gate child-process termination through explicit names and
visible phases without changing observable behavior or public contracts.

## Current behavior

Item72/P14-R16 is verified through PR63 squash main `f7b0aad`, exact tree
`18c0931`, and exact-main workflow `33620771727`. Its successor inventory
selects three reader problems for item73:

- Router helpers such as `reject`, `positivePolicy`, `listType`, `count`, and
  `selectionCost` hide validation, list detection, bounded metric accounting,
  and recursive demand pricing.
- Web names such as `Controls`, `begin`, `runtime`, and `inFlight` hide player
  ownership and session-request state; nested expressions mix GraphQL result
  translation with telemetry and UI recovery.
- The quality-gate runner uses `start`, `finish`, and `fallback` around child
  process ownership, one-time settlement, and graceful-to-forced termination.

The linked Router demand, browser playback, and quality-gate tests characterize
these behaviors before refactoring.

## Proposed behavior

Rename private helpers and local state with demand, playback, and child-process
vocabulary. Extract only concrete translation or lifecycle phases that reduce
simultaneous state tracking. Public exports, GraphQL policies, player behavior,
telemetry fields, command selection, timeout values, signals, exit statuses,
and process-tree cleanup remain unchanged.

## Boundaries

- Owning context: Router owns public GraphQL admission; Web owns browser player
  interaction; repository governance owns the local quality-gate wrapper
- Affected services/packages: `@aster/router`, `@aster/web`, and root tooling
- Authoritative data: none changed
- Read models/caches: none changed
- Trust boundaries: untrusted GraphQL documents and metadata at Router;
  untrusted GraphQL/media outcomes and browser storage availability at Web;
  command-line arguments, signals, child exits, and timeouts at tooling
- External dependencies: existing GraphQL library, Apollo Client, browser media
  APIs, Redux store, Media Chrome, HLS adapter, and operating-system process API

## Invariants

- Router validates request bytes, hash, parser tokens, public schema, operation
  identity, policy bounds, metadata, depth, aliases, roots, selections, list
  expansion, and cost with the same fail-closed outcomes.
- Web creates at most one session request at a time, records the same local
  telemetry, cancels through Apollo disposal on navigation, and never attaches
  a failed or stale player.
- Player controls, focus, captions, quality, progress reporting, preferences,
  accessible status, and recovery actions remain unchanged.
- The quality gate selects the same task list and arguments, settles once,
  removes listeners/timers, preserves child exit status, propagates SIGINT or
  SIGTERM, and force-kills the isolated process tree only at the same bounds.
- Public contracts, schemas, events, persistence, cache, media, authorization,
  telemetry shape, and deployment do not change.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Invalid GraphQL body, metadata, shape, expansion, or cost | Reject with the existing sanitized demand reason before manifest publication | Existing Router rejection metrics consume the unchanged reason category |
| Playback session is unavailable, not playable, rejected, or late after navigation | Preserve the explicit retry UI and never attach stale media | Existing bounded local playback measurement records the same session outcome |
| Caption, manifest, network, decode, unsupported-media, or expiry failure | Preserve the same accessible message and recovery action | Existing local playback event policy and redaction remain unchanged |
| Quality-gate spawn or process-tree termination fails | Return the existing nonzero status and sanitized error reason | Existing JSON error record remains unchanged |
| Quality gate times out or receives SIGINT/SIGTERM | Preserve hard timeout, graceful signal window, forced fallback, and exit status | Existing sanitized `timeout` or `interrupted` result remains unchanged |

## Data and contracts

- Schema/migration: none
- GraphQL: no schema, manifest format, policy value, hash, cost, or runtime scope
  change
- Events: none
- Cache: none
- Compatibility: public exports and observable statuses remain compatible
- Retention/deletion: no data or evidence deletion

## Security and privacy

- Authorization: Router authorization-scope derivation and Web owner requests
  remain unchanged
- Input limits: every Router byte, token, definition, fragment, selection,
  alias, depth, root, list, and cost bound remains unchanged
- Sensitive data: no new logs or telemetry; operation bodies, identifiers,
  signed media URLs, credentials, and browser storage values remain excluded
- Abuse cases: malformed documents, amplification, repeated metadata, numeric
  overflow, duplicate session requests, stale responses, and stuck process
  trees retain characterization

## Implementation steps

1. Run the linked Router, Web, and tooling characterization tests before editing.
2. Rename Router demand rejection, policy validation, list detection, bounded
   metric accounting, and recursive selection-cost phases.
3. Rename Web playback-control ownership, session-request state, result
   translation, telemetry, and recovery phases; remove nested status expressions.
4. Rename quality-gate spawn, settlement, timeout, graceful termination, and
   forced-fallback state.
5. Run focused build/type/lint/tests during iteration and `pnpm check:changed`
   on the coherent candidate.
6. Update the readability inventory, evidence, and repository memory; publish
   one candidate for one review and one confirmation.

## Tests

- Domain: not applicable; domain rules do not change
- Application: Router demand and quality-gate runner tests before and after
- Integration: existing package and affected-scope tests
- Contract: Router schema/demand manifest and public Web operations remain
  covered by existing package and platform checks
- Browser: `playback.spec.ts` before and after for controls, failures,
  cancellation, stale-player prevention, telemetry redaction, and accessibility
- Performance/failure: no benchmark claim; overflow, amplification, timeout,
  signal, process-tree cleanup, session failure, and media recovery remain
  covered by linked tests

## Evidence

- Commands: exact pinned-environment commands and raw output will be retained in
  `evidence/phase-14/p14-r16-router-web-tooling-readability.txt`
- Raw artifact path: `evidence/phase-14/p14-r16-router-web-tooling-readability.txt`
- Acceptance result: Router demand characterization passes 8/8 before and
  after; complete Router passes 26/26. Quality-gate characterization passes 8/8
  before and after. Web source tests pass 119/119 before and after, and strict
  typecheck passes. Changed-file lint/format and architecture checks pass. The
  affected-scope candidate gate passes 46/46 with zero cached tasks in
  1m22.659s. Exact source `4013545`, tree `f8398bb`, repeats it 46/46 with 34
  cached tasks in 38.962 seconds. Local browser acceptance is pending because
  the Docker daemon did not become available; protected candidate acceptance
  remains required.
- Iteration gate: Router build/demand test, Web typecheck/browser playback test,
  and root quality-gate runner test
- Candidate gate: `pnpm check:changed`
- Heavyweight repeat triggers: GraphQL demand math or metadata, public operation
  policy, Web session request/cancellation, player adapter lifecycle,
  accessibility or telemetry behavior, command selection, timeout/signal
  ordering, process-tree cleanup, runtime configuration, or media behavior
- Review stopping rule: one complete initial review and one confirmation; an
  additional round requires a new blocker in requirements, ownership, security,
  availability, data, or a public contract

## Rollback or recovery

Revert the private renames and local extractions. No schema, data, cache, media,
provider, credential, process, or hosted state needs recovery.

## Documentation updates

- `docs/quality/CODE_READABILITY.md`
- `docs/00-start-here/CAPABILITY_INDEX.md` only if a reading entry path changes
- `evidence/phase-14/README.md`
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and
  `.ai/HANDOFF.md`

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
