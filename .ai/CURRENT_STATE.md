# Current State

Last updated: 2026-08-28

## Active phase

**Phase 07 — Playback Sessions and Player**

Status: **IN_PROGRESS**, P07-R01 on local branch feat/p07-playback, based on released main 4083ea65edcf750bf4ba3e253654a529b72cd105. Full Phase 00–14 goal remains active.

## Verified

Phases 00–06 are released. PR 23 final head 37a9a398428f52fdc35942eeb690745d22812736 passed protected CI 33155980591; squash 4083ea65edcf750bf4ba3e253654a529b72cd105 passed exact post-merge CI 33156505851. All review findings are resolved. [Phase 06 release](../evidence/phase-06/release.md).

Phase 06 includes current rights approval, bounded acquisition, isolated full-film HLS/JPEG, durable replay, restricted attestation/publication, compatible rollback, disposable scratch recovery and representative browser playback. [Acceptance matrix](../evidence/phase-06/acceptance.md). No further Phase 06 review or pipeline is pending.

## Current work

P07-R01 now has current-publication projection, private Catalog GraphQL reads, a bounded HTTP consumer, anonymous session rules and Playback-owned PostgreSQL persistence. Affected owner/transport/composition suite passes 233/233; real PostgreSQL proves concurrent admission, expiry/freshness, retention, role isolation and migration up/down/up. Strict builds, affected lint, schema compatibility, architecture and unused-code checks pass. [Backend-core evidence](../evidence/phase-07/README.md). The Playback public mutation, service runtime and Compose wiring remain planned; this is not a running product session API.

[ADR-0027](../docs/adr/0027-local-playback-sessions.md) defines a distinct credential for the bounded private Catalog GraphQL read, separate Router credentials, current rights/URL validation, two-second deadline and fifteen-minute expiry capped by rights. No cross-owner SQL, media proxy or optional personalization dependency. [Active plan](CHANGE_PLAN.md).

Saved P07 work is restored and rebased on released main. Stash 2b0341cbb5604f007fc2206edaf8b37b9c9b1cef is only an older recovery copy; do not apply it again.

## Not implemented

Running Playback subgraph and retained-runtime session database, product player, Docker-only fresh-volume playable journey, automatic S3 garbage collection, engagement/discovery and hosted release. New session persistence is tested only in a disposable database. Synthetic browse titles are technical fixtures, not playable films.

## Next outcome

Complete P07-R01: expose the additive Playback Federation mutation and service runtime, wire separate credentials/migrations in Compose, and prove the connected owner-read/session journey. Then player and clean Docker-only demo. Preserve current source/SQL evidence unless relevant changes invalidate it; no repeated CPU diagnostic, source download, encoding or unchanged Web benchmark.

## Runtime and recovery

Retained project aster-p04-development has schema 0007. Migration 0008 activation history and compatible replace/rollback pass real PostgreSQL tests but are not applied there; apply before invoking new commands. Existing serving Catalog is the verified publication image. [Rollback evidence](../evidence/phase-06/rollback.md).

Big Buck Bunny is PUBLISHED: title 00000000-0000-4000-8000-000000080001, version 9 / rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. The verified bundle contains 209 objects / 95496764 bytes. Source and all audit history remain. [Publication](../evidence/phase-06/publication.md).

The read-only origin serves loopback 9001 on edge only; private writer stays concurrency one on platform. Web/Router remain 3000/4000. Preserve all retained media, databases and user processes.

## Current risks

- ADR-0026 permits cleanup only of exact stopped/expired disposable scratch; immutable content is retained for checked recovery. Hosted lifecycle/fencing/storage budget is P14-R11.
- Shared-host timings are laboratory evidence, not field SLOs. No host investigation is required.
- Last registry audit: zero high/critical and one known moderate UUID advisory; inspected Apollo callers do not use its affected UUID variants. Revisit supported remediation before hosted release.
- Preserve MIT and upstream notices. No paid resources, invented media rights or global Docker cleanup.
