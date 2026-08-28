# Work Item: Accessible HLS player and clean playable demo

- Status: IN_PROGRESS
- Owner: Playback owns session authority; Web owns local player interaction
- Phase: 07
- Requirement IDs: P07-R04, P07-R05, P07-R06, P07-R07, P07-R08, P07-R10, P07-R11, P07-R12
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

Deliver an accessible adaptive watch journey and one Docker-only clean-start playable demo, independent of optional profiles.

## Current behavior

Backend P07-R01 is released at main f2d99d254263baac532ef36edba0ab2c99d20dc3; PR 24 protected CI, one confirmation and post-merge pass. [Release](../evidence/phase-07/backend-release.md). This branch adds the actual player and generated playable demo. Browser/failure/accessibility, empty-volume startup and replay pass; candidate gates/protected publication remain. Retained film/HLS is unchanged. [Player evidence](../evidence/phase-07/player.md).

## Proposed behavior

Public watch route with preloaded metadata and an explicit client-only session/start action. Apollo owns session responses; Redux holds only local preferences. Use pinned HLS.js and selected Media Chrome controls after P07-R11 review. Fetch media directly from the browser. Expose finite errors and bounded local QoE measurements. Finish a project-scoped Docker command with real generated-media initialization, no hosted credentials/manual SQL.

PR 24 startup and fixture-cleanup corrections are released, with 64/64 candidate tasks and passing affected runtime proofs. Player stash 2e85504b1739e3192484c37f5af63977b305eec1 is already restored; do not reapply it or repeat unchanged backend experiments. [Correction evidence](../evidence/phase-07/backend-review.md).

## Boundaries

Catalog owns rights/publications; Playback owns sessions; Web owns local interaction. Paths: apps/web/features/playback, store/player, app/watch/[id], title link, focused/browser tests; then demo tooling/Compose. Trust boundaries: GraphQL payload, storage, manifests/segments/captions, user activation and lifecycle. Existing React/Next/Apollo/Redux pins remain; review HLS.js 1.7.1 and Media Chrome 4.19.2 package compatibility and notices before use.

## Invariants

No SSR session creation, remote state in Redux, stored session URL/ID/history, media proxy, optional Identity dependency, arbitrary URL input or automatic mutation retry. No private configuration in client assets. Do not invent captions for the approved film.

## Failure behavior

Finite session/expiry, manifest, network, decode, unsupported-media, caption and fatal messages. Unknown mutation outcome requires deliberate retry. HLS GET retry and recovery are bounded; unmount/expiry stops loads and destroys the adapter. Optional caption failure is visible without blocking video. Corrupt/blocked storage uses defaults. Native fallback exposes quality limitations.

## Data and contracts

Reuse StartPlayback; no durable migration. Versioned preferences contain only volume, mute, rate, captions and quality, validated after hydration. QoE: finite in-memory events, monotonic durations, no user/title/session IDs or URLs, no remote collection. Phase 08 owns durable progress.

## Security and privacy

Fixed Router origin, omitted cookies, bounded response/concurrency and 4s deadline/cancellation. Validate returned title/expiry/reference before attachment. Bound HLS buffers/timeouts/retries. Never render library error objects. Demo provenance must prove generated source rights; retain existing volumes.

## Implementation steps

1. Record control decision; verify packages/licenses.
2. Test session client, local state, errors/QoE and HLS lifecycle.
3. Wire client-only watch UI, keyboard controls, captions/quality and attribution.
4. Verify real browser/failure/accessibility/direct-media path and lazy bundle impact.
5. Implement ADR-0029's fixed generated playable seed, immutable object publication and explicit Compose readiness. Verify empty-volume Docker demo and scoped diagnostics/cleanup; preserve the retained film and database. The original browse seed stays unchanged.
6. Correct observed default-caption cue loss and immutable S3 replay failure, with focused adapter tests and real caption/replay confirmation. Keep the native caption selector; omit the redundant upstream toggle with invalid ARIA semantics. These are active acceptance boundaries, not speculative hardening.
7. Consolidate evidence/review/protected release after the backend predecessor.

## Tests

Payload/URL/expiry/operation validation; cancellation/late response; storage corruption/bounds; telemetry redaction; adapter cleanup/native/quality/captions. Browser: actual HLS frame, seek/mute/rate/fullscreen, keyboard/focus/labels, preferences/reload, expiry/rejection/missing media/slow network and a labeled caption fixture. Verify Chromium first; record native/WebKit/Firefox evidence without claiming untested devices.

## Evidence

Iteration: focused Web tests and affected TypeScript/ESLint. Candidate: changed-scope source/docs/security, schema, browser/accessibility/failures, notices/bundle and protected CI. Repeat browser proof only when its adapter/control/transport boundary changes; clean demo only when packaging/seed/Compose changes. No unchanged CPU/film/SQL experiment. One initial and one confirmation review, batch only requirement/security/data/availability/public-contract blockers. Raw results: evidence/phase-07.

## Rollback or recovery

Keep PR 24 frozen. Revert additive player/watch entry, retain browsing. Ignore/reset preference version without product-data loss. Demo cleanup verifies exact ownership; never reset retained development media.

PR 24 is now squash-merged at f2d99d254263baac532ef36edba0ab2c99d20dc3 after protected CI 33163548411 and confirmation 5451448968. Exact post-merge run 33164139588 passes all applicable jobs. This player branch is rebased without changing the backend tree. For real browser acceptance, preserve the current Web/Router/Catalog images and a local Catalog-only database backup, apply tested additive Catalog 0008 and Playback 0001 with their normal initializers, then upgrade only those application services from verified images. Media, PostgreSQL/Redis containers, other processes and publication pointer remain unchanged. Roll back application images while retaining additive audit/schema; never run destructive down against this retained database.

## Documentation updates

Player decision, browser limitations, failure/QoE definitions, one-command demo and acceptance at coherent checkpoints. Memory tracks dependency/rebase and next action.

## Completion checklist

- [x] Player strategy/package compatibility recorded
- [x] Session/preferences/error/QoE/adapter tests pass
- [x] Accessible watch journey and failures verified (Chromium; content/browser limitations recorded at checkpoint)
- [x] Empty-state Docker playable demo verified locally
- [x] Predecessor released
- [x] Player/demo local candidate gate 64/64 and zero-high/critical dependency audit
- [ ] Protected review/release complete
