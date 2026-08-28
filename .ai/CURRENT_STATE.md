# Current State

Last updated: 2026-08-28

## Active phase

**Phase 06 — Media Ingestion and Publication**

Status: **IN_PROGRESS**, local-only on feat/p06-media-pipeline based on released main f36f9aa7043dc1fe7b6394a0a800e4e842bf6865.

## Verified

Phases 00–05 are released. PR 22 squash f36f9aa passes protected CI 33132937180 and exact post-merge CI 33133330003. [Phase 05 release](../evidence/phase-05/release.txt).

## Current work

P06-R01 is the sole active implementation item. Big Buck Bunny's exact official archive is approved through Catalog at rights revision 2 / title version 3 and now acquired privately: 121284117 bytes, SHA-256 7118242b6728d40c871479c5b3c0f0fb27d748089df15d7f1b469f297c74a2d6. Title remains RIGHTS_REVIEWED with no publication. No extraction or processing yet. [Acquisition evidence](../evidence/phase-06/acquisition.md).

Durable requests, three-attempt recovery, current-rights watchdog, bounded HTTPS streaming and conditional verified S3 storage are implemented/tested locally. Real PostgreSQL, storage conflict and cross-process replay checks pass. Migration 0004/0005 and the first request are applied to aster-p04-development. The source download took 12.003 s; sampled Node RSS peaked at 97685504 bytes, not total container memory. The first attempt failed before GET because its network was internal-only; the finite job now has a separate egress bridge. [Exact gates and limitations](../evidence/phase-06/acquisition.md).

## Not implemented

Playable VOD, a real media pipeline, engagement/discovery and hosted release. The synthetic seed remains a technical fixture, not film approval.

## Next outcome

Continue P06-R01 with bounded archive extraction, probe, isolated FFmpeg and the verified-result/attestation authority. Reuse the acquired immutable original; do not redownload it or repeat unchanged Web/acquisition experiments. No hosted wait remains.

## Current risks

- Shared Windows/WSL timings are laboratory evidence, not arbitrary-load or field SLO guarantees; no further unchanged Web benchmark.
- Official Blender downloads currently list ZIP archives; extraction must be bounded and validated, not shell interpolation.
- Local VersityGW requires one POSIX action at a time for conditional-write atomicity; keep platform internal and acquisition-only egress. Hosted origin atomicity is a Phase 14 acceptance condition.
- uuid advisory GHSA-w5hq-g745-h8pq is moderate and transitive through Apollo. Installed callers use v1/v4 without buffers, not affected v3/v5/v6; revisit supported remediation before hosted release. No alert dismissal or audit weakening.
- Keep MIT/upstream notices; no paid resources, invented media rights or global Docker cleanup.
