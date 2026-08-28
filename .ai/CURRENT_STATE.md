# Current State

Last updated: 2026-08-28

## Active phase

**Phase 06 — Media Ingestion and Publication**

Status: **IN_PROGRESS**, local-only on feat/p06-media-pipeline based on released main f36f9aa7043dc1fe7b6394a0a800e4e842bf6865.

## Verified

Phases 00–05 are released. PR 22 squash f36f9aa passes protected CI 33132937180 and exact post-merge CI 33133330003. [Phase 05 release](../evidence/phase-05/release.txt).

## Current work

P06-R01 is the sole active implementation item. The approved Big Buck Bunny original now has a fully decoded HLS candidate: 426×240 and 638×358, AAC stereo, 596.5 seconds and 203 media objects (95430911 bytes). Catalog retained every object and report privately after checksum readback/current-rights checks. Title remains rights revision 2 / version 3 / RIGHTS_REVIEWED, no publication. [Decoder evidence and exact candidate key](../evidence/phase-06/decoder.md).

Durable requests, three-attempt recovery, current-rights watchdog, bounded HTTPS streaming and conditional verified S3 storage are implemented/tested locally. Real PostgreSQL, storage conflict and cross-process replay checks pass. Migration 0004/0005 and the first request are applied to aster-p04-development. The source download took 12.003 s; sampled Node RSS peaked at 97685504 bytes, not total container memory. The first attempt failed before GET because its network was internal-only; the finite job now has a separate egress bridge. [Exact gates and limitations](../evidence/phase-06/acquisition.md).

Durable processing now has one global slot, three checksum/recipe attempts, 30-minute leases and current-rights reuse. Migration 0006 is applied; the existing candidate was independently verified and adopted as attempt 68e41f87-ca12-44ff-96d3-8a9e66d67795, then replayed without new encoding/writes. Focused tests 19/19, real PostgreSQL and affected source gate 61/61 pass. [Processing evidence](../evidence/phase-06/processing.md).

## Not implemented

Public playable VOD, trusted attestation, derived artwork, engagement/discovery and hosted release. The synthetic seed remains a technical fixture.

## Next outcome

Continue P06-R01 with reviewed artwork, truthful modification attribution and the restricted attestation/public-origin/publication boundary. Reuse the private HLS candidate and original; no unchanged transcode, acquisition or Web benchmark. No hosted wait remains. Focus execution on remaining product requirements, not Windows/CPU diagnostics.

## Current risks

- Shared Windows/WSL timings are laboratory evidence, not arbitrary-load or field SLO guarantees; no further unchanged Web benchmark.
- Official Blender downloads currently list ZIP archives; extraction must be bounded and validated, not shell interpolation.
- Local VersityGW requires one POSIX action at a time for conditional-write atomicity; keep platform internal and acquisition-only egress. Hosted origin atomicity is a Phase 14 acceptance condition.
- uuid advisory GHSA-w5hq-g745-h8pq is moderate and transitive through Apollo. Installed callers use v1/v4 without buffers, not affected v3/v5/v6; revisit supported remediation before hosted release. No alert dismissal or audit weakening.
- Keep MIT/upstream notices; no paid resources, invented media rights or global Docker cleanup.
