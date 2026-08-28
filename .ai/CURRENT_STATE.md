# Current State

Last updated: 2026-08-28

## Active phase

**Phase 06 — Media Ingestion and Publication**

Status: **IN_PROGRESS**, local acceptance candidate on feat/p06-media-pipeline, based on released main f36f9aa7043dc1fe7b6394a0a800e4e842bf6865. Full Phase 00–14 goal remains active.

## Verified

Phases 00–05 are released. PR 22 squash f36f9aa passes protected CI 33132937180 and exact post-merge CI 33133330003. [Phase 05 release](../evidence/phase-05/release.txt).

## Current work

Latest: d885647 passed protected CI 33155106519. Its complete external confirmation reported only ambiguous lock-creation recovery classification. The narrow correction distinguishes unknown write outcome from definite 412 contention/pre-abort; focused build/lint/tests pass, with no policy/SQL/media change. [Confirmation evidence](../evidence/phase-06/rights-access-confirmation.md). Commit/push, resolve that diagnosed finding and require new exact-head CI; no extra media/review loop. Local P07 publication projection/queries (12 tests passing) are preserved in stash 2b0341cbb5604f007fc2206edaf8b37b9c9b1cef on feat/p07-playback; restore/rebase after this predecessor correction.

PR 23 is ready. Head 9723032 passed full protected CI 33153640859, but confirmation found a rights/access race and stale acquisition guide. The correction holds the policy barrier through current approval/SQL registration and compensates rejected new grants without removing prior grants. Focused 27/27, full source 51/51 and real S3 race/rejection checks pass. Finish final storage/documentation closeout, commit/push the coherent correction and require exact-head CI/confirmation. [Current evidence](../evidence/phase-06/rights-access-confirmation.md). No host investigation or encode.

Earlier corrections in 7150bb5/9723032 preserve private incomplete copies, processing windows and cross-title checksum reuse. The retained 209-object bundle was restricted and all anonymous HEADs/CORS/Range/negative permissions pass without media/editorial writes. [Access evidence](../evidence/phase-06/publication-access.md), [initial review remediation](../evidence/phase-06/review-remediation.md). Older green/failed heads are historical evidence, not final release proof.

[Phase 06 acceptance](../evidence/phase-06/acceptance.md), implementation head f28c442, maps all twelve requirements to code/tests and measured evidence: approved source, bounded acquisition, isolated full-film HLS/JPEG, durable leases/replay, restricted attestation, immutable publication, compatible rollback, disposable orphan cleanup and real browser playback.

Big Buck Bunny is locally PUBLISHED: title 00000000-0000-4000-8000-000000080001, version 9 / rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. The bundle contains 209 objects / 95496764 bytes. Original review 2 and all source/processing/audit history remain. [Publication](../evidence/phase-06/publication.md).

Both real HLS renditions passed beginning/middle/end browser decode: six samples, no HLS/browser errors. Source gate passes 51/51 without cache. The temporary probe was removed and the exact Web restored, home HTTP 200. [Browser evidence](../evidence/phase-06/browser.md).

## Not implemented

Completed product-player/Docker-only fresh-volume playable journey, automatic S3 garbage collection, engagement/discovery and hosted release. Phase 06 protected CI, confirmation and release remain pending. Synthetic browse titles are technical fixtures, not playable films.

## Next outcome

Finish P06-R01: publish one coherent Phase 06 candidate; require protected exact-head CI and confirmation, squash without bypass and verify exact post-merge CI. Then activate Phase 07 from clean released main. No repeated CPU diagnostic, source GET, encoding or unchanged Web benchmark.

## Runtime and recovery

Retained project aster-p04-development has schema 0007. Migration 0008 activation history and compatible replace/rollback pass real PostgreSQL tests but are not applied there yet; apply before invoking new commands. Existing serving Catalog is the verified publication image. [Rollback evidence](../evidence/phase-06/rollback.md).

The read-only origin serves loopback 9001 on edge only, storage mounted read-only; private writer stays concurrency one on platform. Web/Router remain 3000/4000. Source, HLS/JPEG candidates, databases and audit are preserved.

## Current risks

- ADR-0026 resolves local retention: clean only exact stopped/expired disposable job scratch; retain immutable objects, including partial content-addressed copies, for checked recovery. Hosted lifecycle/fencing/storage budget is explicitly P14-R11, not implemented.
- Shared-host timings are laboratory evidence, not field SLOs. No host/CPU investigation is required.
- Current registry audit: zero high/critical and one known moderate UUID advisory. Inspected Apollo callers use v1/v4, not affected v3/v5/v6; revisit supported remediation before hosted release.
- Preserve MIT and upstream notices. No paid resources, invented media rights or global Docker cleanup.
