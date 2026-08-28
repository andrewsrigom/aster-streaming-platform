# Current State

Last updated: 2026-08-28

## Active phase

**Phase 08 — Progress, History, Watchlist, and Continue-Watching**

Status: **IN_PROGRESS**, P08-R01 on feat/p08-progress, rebased on main 854592e5ff1213a306b45d61a547ad4f2a2d9395. P07-R04 is DONE: protected CI 33170527302, confirmation 5452439397, squash and exact post-merge 33171284170 pass. [Phase 07 release](../evidence/phase-07/release.md). No external predecessor remains. Full Phase 00–14 goal remains active.

## Verified

Phases 00–07 are released locally, with protected review/CI and exact post-merge checks. [Phase 07 acceptance](../evidence/phase-07/release.md) covers all twelve requirements and explicit browser/content limitations. [Phase 06 release](../evidence/phase-06/release.md) retains the film/pipeline history. No hosted deployment is claimed.

Phase 06 includes current rights approval, bounded acquisition, isolated full-film HLS/JPEG, durable replay, restricted attestation/publication, compatible rollback, disposable scratch recovery and representative browser playback. [Acceptance matrix](../evidence/phase-06/acceptance.md). No further Phase 06 review or pipeline is pending.

## Current work

P08-R01 domain/application are implemented: exact/conflicting replay, global per-profile/title sequence, configured opening/completion, clamped positions, bounded clocks, owner-validation ports, transaction/outbox intent and cancellation. [32 focused tests and ten real SQL scenarios](../evidence/phase-08/README.md), strict TypeScript, scoped lint and architecture pass. PostgreSQL migration/adapter now prove durable atomic progress/receipt/outbox, replay, ordering, bounds and safe rollback. Owner adapters and running save UI remain next.

P07-R01's public Playback mutation, private Catalog read, isolated PostgreSQL sessions, lifecycle/readiness and Compose wiring are released. Real PostgreSQL covers admission, expiry, retention, restricted credentials and migrations. The connected Router/Catalog/Playback proof covers rights rejection, bounded failures/recovery and independence from Identity. [Backend evidence](../evidence/phase-07/README.md). Player/demo acceptance and local application upgrade are also complete.

[ADR-0027](../docs/adr/0027-local-playback-sessions.md) defines a distinct credential for the bounded private Catalog GraphQL read, separate Router credentials, current rights/URL validation, two-second deadline and fifteen-minute expiry capped by rights. No cross-owner SQL, media proxy or optional personalization dependency. [Active plan](CHANGE_PLAN.md).

Saved P07 work is restored and rebased on released main. Stash 2b0341cbb5604f007fc2206edaf8b37b9c9b1cef is only an older recovery copy; do not apply it again.

## Not implemented

Engagement private transport/subgraph, durable player save, watchlist, projections/relay, Discovery and hosted release remain unimplemented. Signal / 01 is a non-delivery browse fixture; Signal / 02 is a playable generated technical sample, not a third-party film.

## Next outcome

Continue P08-R01 with private owner reads and runtime under ADR-0030. SQL/concurrency/rollback are proven; the fixture and its private network are removed. PR 25 and post-merge are complete; this branch is rebased. No duplicate review/pipeline or unchanged CPU/film test.

## Runtime and recovery

Retained project aster-p04-development now has Catalog 0008 and Playback 0001, applied through tested initializers after a Catalog backup. [Upgrade and rollback](../evidence/phase-07/backend-release.md). Existing publication, media and audit are preserved.

Big Buck Bunny is PUBLISHED: title 00000000-0000-4000-8000-000000080001, version 9 / rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. The verified bundle contains 209 objects / 95496764 bytes. Source and all audit history remain. [Publication](../evidence/phase-06/publication.md).

The read-only origin serves loopback 9001 on edge only; private writer stays concurrency one on platform. Web/Router remain 3000/4000. Preserve all retained media, databases and user processes.

## Current risks

- ADR-0026 permits cleanup only of exact stopped/expired disposable scratch; immutable content is retained for checked recovery. Hosted lifecycle/fencing/storage budget is P14-R11.
- Shared-host timings are laboratory evidence, not field SLOs. No host investigation is required.
- Last registry audit: zero high/critical and one known moderate UUID advisory; inspected Apollo callers do not use its affected UUID variants. Revisit supported remediation before hosted release.
- Preserve MIT and upstream notices. No paid resources, invented media rights or global Docker cleanup.
