# Current State

Last updated: 2026-08-28

## Active phase

**Phase 07 — Playback Sessions and Player**

Status: **IN_PROGRESS**, P07-R04 on feat/p07-player from released backend f2d99d254263baac532ef36edba0ab2c99d20dc3. P07-R01 is DONE: [protected release and local upgrade](../evidence/phase-07/backend-release.md). Full Phase 00–14 goal remains active.

## Verified

Phases 00–06 are released. PR 23 final head 37a9a398428f52fdc35942eeb690745d22812736 passed protected CI 33155980591; squash 4083ea65edcf750bf4ba3e253654a529b72cd105 passed exact post-merge CI 33156505851. All review findings are resolved. [Phase 06 release](../evidence/phase-06/release.md).

Phase 06 includes current rights approval, bounded acquisition, isolated full-film HLS/JPEG, durable replay, restricted attestation/publication, compatible rollback, disposable scratch recovery and representative browser playback. [Acceptance matrix](../evidence/phase-06/acceptance.md). No further Phase 06 review or pipeline is pending.

## Current work

P07-R04 is the sole active item on feat/p07-player, based on released backend f2d99d254263baac532ef36edba0ab2c99d20dc3. PR 25's initial player/demo candidate is 7d49e8bd33704ec326ab324a1ff35325128f93f2. Both review blockers are corrected together: non-delivery seed eligibility and Web-only demo CI coverage. Initial CI also exposed a test-clock race, corrected without changing production rights checks. Web 46/46, real PostgreSQL, two affected browser journeys and corrected candidate 64/64 pass. [Batched correction](../evidence/phase-07/player-review.md). Empty-volume startup, captioned HLS, direct origin/private denial and immutable replay remain supporting evidence. Protected confirmation/release remain.

P07-R01's public Playback mutation, current private Catalog read, isolated PostgreSQL sessions, lifecycle/readiness and Compose wiring are locally verified. Affected suite passes 248/248, source 54/54 and final changed-scope/governance gate 64/64; real PostgreSQL covers admission, expiry, retention, restricted runtime credentials and migrations. A disposable real Router/Catalog/Playback journey proves persisted sessions, rights rejection, bounded failures/recovery and independence from Identity. [Backend evidence](../evidence/phase-07/README.md). Protected review/squash/post-merge and local application upgrade are complete; player acceptance remains open.

[ADR-0027](../docs/adr/0027-local-playback-sessions.md) defines a distinct credential for the bounded private Catalog GraphQL read, separate Router credentials, current rights/URL validation, two-second deadline and fifteen-minute expiry capped by rights. No cross-owner SQL, media proxy or optional personalization dependency. [Active plan](CHANGE_PLAN.md).

Saved P07 work is restored and rebased on released main. Stash 2b0341cbb5604f007fc2206edaf8b37b9c9b1cef is only an older recovery copy; do not apply it again.

## Not implemented

Automatic S3 garbage collection, engagement/discovery and hosted release. Phase 07 protected player/demo acceptance is pending. Signal / 01 remains a non-delivery browse fixture; Signal / 02 is a playable generated technical sample, not a third-party film.

## Next outcome

Publish P07-R04 / PR 25's one correction commit, resolve the two addressed threads and request one confirmation on its exact SHA. Require protected CI, squash and exact post-merge; then activate Phase 08. Do not rerun the old failed pipeline. Preserve unchanged film/demo evidence; no CPU diagnostic or full-film encode.

## Runtime and recovery

Retained project aster-p04-development now has Catalog 0008 and Playback 0001, applied through tested initializers after a Catalog backup. [Upgrade and rollback](../evidence/phase-07/backend-release.md). Existing publication, media and audit are preserved.

Big Buck Bunny is PUBLISHED: title 00000000-0000-4000-8000-000000080001, version 9 / rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. The verified bundle contains 209 objects / 95496764 bytes. Source and all audit history remain. [Publication](../evidence/phase-06/publication.md).

The read-only origin serves loopback 9001 on edge only; private writer stays concurrency one on platform. Web/Router remain 3000/4000. Preserve all retained media, databases and user processes.

## Current risks

- ADR-0026 permits cleanup only of exact stopped/expired disposable scratch; immutable content is retained for checked recovery. Hosted lifecycle/fencing/storage budget is P14-R11.
- Shared-host timings are laboratory evidence, not field SLOs. No host investigation is required.
- Last registry audit: zero high/critical and one known moderate UUID advisory; inspected Apollo callers do not use its affected UUID variants. Revisit supported remediation before hosted release.
- Preserve MIT and upstream notices. No paid resources, invented media rights or global Docker cleanup.
