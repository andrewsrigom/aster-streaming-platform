# Current State

Last updated: 2026-08-28

## Active phase

**Phase 08 — Progress, History, Watchlist, and Continue-Watching**

Status: **IN_PROGRESS**, P08-R01 on feat/p08-progress, rebased on main 854592e5ff1213a306b45d61a547ad4f2a2d9395. P07-R04 is DONE: protected CI 33170527302, confirmation 5452439397, squash and exact post-merge 33171284170 pass. [Phase 07 release](../evidence/phase-07/release.md). No external predecessor remains. Full Phase 00–14 goal remains active.

## Verified

Phases 00–07 are released locally, with protected review/CI and exact post-merge checks. [Phase 07 acceptance](../evidence/phase-07/release.md) covers all twelve requirements and explicit browser/content limitations. [Phase 06 release](../evidence/phase-06/release.md) retains the film/pipeline history. No hosted deployment is claimed.

Phase 06 includes current rights approval, bounded acquisition, isolated full-film HLS/JPEG, durable replay, restricted attestation/publication, compatible rollback, disposable scratch recovery and representative browser playback. [Acceptance matrix](../evidence/phase-06/acceptance.md). No further Phase 06 review or pipeline is pending.

## Current work

P08-R01 now includes current private Identity/profile and Playback/session reads, protected Engagement GraphQL, restricted runtime/migrator/readiness, fourth-subgraph composition and Docker/CI wiring. The [real federated proof](../evidence/phase-08/federated-runtime.txt) passes durable acknowledgement, concurrent replay, conflict/stale rejection, foreign ownership, expired context, lock failure/recovery, deletion/revocation denial and trace correlation. Anonymous Playback succeeds after Identity/Engagement stop. The disposable project left zero resources; retained demo/media are untouched.

[Core/SQL evidence](../evidence/phase-08/README.md) remains supporting evidence for unchanged transaction/constraint behavior. Candidate quality passes 67/67 tasks; protected review/release remain pending. No browser save/resume is implemented.

## Not implemented

Player progress reports/resume, watchlist/history reads, relay/consumers, Discovery and hosted release remain planned. Engagement's backend is implemented and Docker-tested, not released. Signal / 01 is browse-only; Signal / 02 is the generated captioned playable sample.

## Next outcome

P08-R01: confirmation 5453879542 passes corrected 736bcdac. CI 33180440040 failed an unchanged Catalog attestation fixture because its fixed clock can precede the actual SQL publication timestamp. Fix that test clock, verify real SQL and candidate checks, then publish and finish protected merge/post-merge. No production check is relaxed. P08-R06 is preserved in exact stash d4320f6f84043fc92c2ffc687a075f087e377753 on feat/p08-history with 60 tests and real SQL/federated reads passing; restore it once after rebase. Older stashes are already restored. No CPU/media loop.

## Runtime and recovery

Retained project aster-p04-development now has Catalog 0008 and Playback 0001, applied through tested initializers after a Catalog backup. [Upgrade and rollback](../evidence/phase-07/backend-release.md). Existing publication, media and audit are preserved.

Big Buck Bunny is PUBLISHED: title 00000000-0000-4000-8000-000000080001, version 9 / rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. The verified bundle contains 209 objects / 95496764 bytes. Source and all audit history remain. [Publication](../evidence/phase-06/publication.md).

The read-only origin serves loopback 9001 on edge only; private writer stays concurrency one on platform. Web/Router remain 3000/4000. Preserve all retained media, databases and user processes.

## Current risks

- ADR-0026 permits cleanup only of exact stopped/expired disposable scratch; immutable content is retained for checked recovery. Hosted lifecycle/fencing/storage budget is P14-R11.
- Shared-host timings are laboratory evidence, not field SLOs. No host investigation is required.
- Last registry audit: zero high/critical and one known moderate UUID advisory; inspected Apollo callers do not use its affected UUID variants. Revisit supported remediation before hosted release.
- Preserve MIT and upstream notices. No paid resources, invented media rights or global Docker cleanup.
