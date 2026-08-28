# Phase 06 local acceptance candidate

2026-08-28, branch `feat/p06-media-pipeline`, implementation head `f28c442`, based on released Phase 05 `f36f9aa7043dc1fe7b6394a0a800e4e842bf6865`. Status: local acceptance candidate; protected CI, confirmation and release are pending. No hosted deployment or finished product player is claimed.

## Requirement traceability

| Requirement | Implemented boundary / acceptance | Evidence |
|---|---|---|
| P06-R01 | Current approved source identity before acquisition, processing/reuse and attestation; rights disputes fence completion | [Requests](media-requests.md), [processing](processing.md), [publication](publication.md) |
| P06-R02 | HTTPS redirect/size/stall/deadline/cancellation checks; streamed checksum and backpressure | [Acquisition](acquisition.md), `media-download.test.ts` and `media-execution.test.ts` |
| P06-R03 | Conditional immutable original, independent checksum/readback, bounded ZIP/CRC and strict probe policy | [Acquisition](acquisition.md), [decoder](decoder.md) |
| P06-R04 | Networkless non-root FFmpeg process/container with deadlines, cancellation, tmpfs and process-tree cleanup | [Decoder](decoder.md), [abandoned scratch](scratch.md) |
| P06-R05 | Source-aware 426×240/638×358 HLS, AAC stereo, two posters/three thumbnails; no upscaling | [Decoder](decoder.md), [artwork](artwork.md) |
| P06-R06 | Versioned independent HLS/artwork recipes, durable three-attempt leases and checksum/recipe reuse | [Processing](processing.md), [artwork](artwork.md) |
| P06-R07 | Strict manifests/object hashes, codec/stream/timeline checks, full offline decode plus representative browser decode/seeks | [Decoder](decoder.md), [browser six-sample result](browser.md) |
| P06-R08 | Conditional immutable bundle copies, child-before-master ordering, complete readback and no partial active pointer | [Publication foundation](publication-foundation.md), [actual publication](publication.md) |
| P06-R09 | Separate restricted attester, title-locking current-rights checks, normal audited editorial activation | [Publication](publication.md), real `attestation-postgres.ts` |
| P06-R10 | Bounded safe retry/terminal failure/cancellation, abandoned disposable scratch cleanup, compatible prior-version rollback | [Acquisition](acquisition.md), [processing](processing.md), [scratch](scratch.md), [rollback](rollback.md) |
| P06-R11 | Title/global rights attribution and bundle attribution with material modifications; original credits preserved | [Rights review](rights-review.md), [publication](publication.md) |
| P06-R12 | Durable request/start/end/outcome, streamed bytes/resource samples, measured encode duration and output ratio | [Acquisition](acquisition.md), [processing request-to-start age](processing.md), [decoder](decoder.md), [publication](publication.md) |

The approved source has no captions, transcript or audio-description track. Caption transformation is therefore not applicable to this first-film acceptance; unexpected extra streams are rejected rather than silently discarded or fabricated. Browser audio was decoded/muxed but not evaluated for audible quality. Product captions, controls, accessibility and playback telemetry remain Phase 07/12 obligations where applicable.

## Recovery / retention assessment

[ADR-0026](../../docs/adr/0026-local-media-publication.md#local-retention-boundary-phase-06-closeout) resolves the earlier storage-prefix assessment: disposable job orphans are cleaned; immutable content-addressed objects are intentionally retained for integrity-checked recovery, not automatically garbage-collected. This matches the existing invariants and preserves originals, candidates, previous publications and audit. No new S3 deletion authority or untested lifecycle policy is introduced. Hosted retention, writer fencing and storage budgets are explicit Phase 14 prerequisites, not an implemented claim.

`publication-bundle.test.ts` verifies interrupted copy, unchanged existing objects during replay, corruption rejection and absence of a master on partial copy. `decoder-handoff.test.ts` verifies partial/corrupt candidates cannot complete. Processing/PostgreSQL tests verify expired/terminal attempts, cancellation and exact eligible reuse. Scratch recovery has a real disposable Docker fixture. Rollback has real PostgreSQL authority/race/history tests; it may select only a previously active compatible validated version, not any old object prefix. No second film is required to prove these invariants.

## Candidate gates / repeat policy

[Acceptance documentation/security gate](acceptance-closeout.txt): 10/10 tasks, five cached, 4.525s. No blocking local requirement finding remains; exact-head protected CI/confirmation and release are still required.

- Latest full source gate: [51/51 tasks without cache](browser-source.txt), `pnpm check:source --concurrency=2`, Node 24.19.0/pnpm 11.24.0, 1m49.398s.
- [Documentation/security closeout](browser-closeout.txt): 10/10, no cache, 7.48s. Acceptance prose is checked again at its checkpoint.
- [Current registry audit](acceptance-audit.json): zero high/critical, one moderate transitive UUID advisory. The existing analysis found Apollo v1/v4 callers, not the affected v3/v5/v6 paths; no suppression or weakened threshold. Revisit before hosted release.
- Real PostgreSQL acquisition/processing/attestation/rollback, S3 immutable-copy/origin negatives, original/HLS/JPEG and actual browser results are linked above with their exact source/image/checksum evidence. Later scratch/probe/declaration/prose changes do not change those owner SQL, storage, source or recipe behaviors. They remain supporting acceptance evidence; no unchanged film GET/encode or CPU benchmark is repeated.
- Protected CI must run on the exact final head in a fresh checkout with frozen installation, schema/known-operation and the selected Docker gates. This candidate is not released until that and confirmation pass, followed by squash and exact post-merge CI.

Initial review covers all twelve rows, security/data/trust boundaries, retained history, deadlines, failures and public contracts. Confirmation is limited to blocking findings and the final CI head. Non-blocking speculative hardening does not extend this phase. A changed source/recipe/SQL/storage boundary repeats its affected experiment; prose and independent probe changes do not repeat unrelated heavy work.

## Release / rollback notes

Catalog remains the sole owner; no new public GraphQL mutation, context, database, broker or service authority is added. Additive migrations 0004–0008 precede the matching owner tooling. Current retained project has 0007; migration 0008 must be applied before invoking the new replace/rollback commands. Its backfill uses retained published-event history. Empty-only downgrade guards preserve used audit data; after use, roll forward. The existing serving publication remains compatible.

Local title `00000000-0000-4000-8000-000000080001` is PUBLISHED at version 9 / rights revision 4, publication `c2929850-d3a3-4e30-945f-688d639d2c68`. Its 209-object bundle is immutable. Ordinary retirement remains safe when there is no compatible prior activation. Do not roll back by deleting data, changing object bytes or downgrading used audit vocabulary.

The read-only media origin is opt-in, loopback-only and separate from the private single-writer S3 gateway. Existing browse/profile Web was restored and returns 200. Originals are private; clients fetch published media directly, not through application services. Default/hosted policy continues to reject the local HTTP media namespace. HLS.js is a root development-only technical probe dependency; its upstream notices are preserved.

Phase 07 prerequisites are now locally present: approved actual film, reachable immutable HLS and attribution, existing Catalog/Identity supergraph and SSR foundation. After Phase 06 protected release, start the Playback owner and product-player/Docker-only fresh-volume journey. Do not describe the current probe or existing synthetic browse seed as that completed journey.
