# Current State

Last updated: 2026-08-27

## Active phase

**Phase 03 — Catalog and Content Rights**

Status: **IN_PROGRESS**

## Verified

- Phases 00–02 are released. PR 19 squash ec6386ca7add0f12ae748589be763d9e90ff0d6c is the main base.
- Protected 33066484199 and post-merge 33066827332 pass: 144 Identity tests, eleven real scenarios, UID 1000, six metric families and Docker local login/profile journey. [Release evidence](../evidence/phase-02/release.txt).
- The four retained Aster containers remain healthy. No demo data, unrelated resources or public remote changed during the Catalog slices.

## Current work

P03-R01 is committed as 4968d42. P03-R02 on feat/p03-catalog-rights is locally verified: PostgreSQL rights revisions and immutable actor/time/correlation provenance. 61 tests and real PostgreSQL integration pass, including eight synchronized writers (one commit/seven conflicts), rollback/abort/timeout, keysets, Unicode, privileges and migration round-trip. Initial/confirmation review and all 52 candidate tasks pass (38 cached, 17.092 s); no independent approval or remote release claimed. [Evidence and completed plan](../evidence/phase-03/catalog-persistence.txt).

## Not implemented

Catalog operator authentication/commands, publish-dispute transactions/outbox, public browse/schema, localized metadata, real rights records and generated HLS fixture. Router, web UI, media/playback, engagement/discovery and hosted release remain planned. No playable VOD demo or approved film exists.

## Next outcome

Activate READY P03-R06 with a new bounded plan: owning operator workflow, lifecycle/audit/outbox and deterministic publication contract; public queries/schema follow. P03-R02 is complete locally with its evidence and source checkpoint. Keep one Phase 03 publication rather than storage-only PRs.

## Current risks

- Compatible licensing decisions are authorized; retain MIT unless actual compatibility requires change. Preserve notices/terms. No repeated Apollo permission pause.
- High/critical audit passes with the known moderate uuid advisory outside inspected Apollo v1/v4 paths; recheck on upgrades.
- Viewer JWTs are not operator credentials. Persistence accepts facts from a future authorized owning application; storing APPROVED is not a license review or authorization.
- Rights/provenance are durable, immutable to runtime roles, not auto-evicted. Catalog publication events are not implemented; Identity pending outbox remains capped at 128/account until Phase 08 relay.
- Domain publication references validate structure, not media bytes. Pre-acquisition checksum can be null; actual rights permission must precede download.
- SQL evidence covers synthetic revisions/local Linux amd64, not hosted capacity, publish/dispute behavior or other operating systems.
- No broad reset/prune, remote bypass, private motivation in docs or changes to unrelated Dependabot PR 1.
