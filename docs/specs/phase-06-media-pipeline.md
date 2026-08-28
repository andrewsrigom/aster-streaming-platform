# Phase 06 — Media Ingestion and Publication

## Objective

Turn one or more approved source films into validated immutable HLS publications through a reproducible, observable, and failure-safe pipeline.

## Product traceability

- Primary: `CAT-R04`, `MED-R01`, `MED-R02`, `MED-R03`, `MED-R04`, `MED-R05`, `MED-R06`.
- Supports: `CAT-R02`, `CAT-R06`, `OPS-R02`, `OPS-R03`, `QLT-R01`, `QLT-R02`, `QLT-R04`.

## Prerequisites

- Phase 03 rights workflow is verified.
- At least one title has an approved rights record.
- Local FFmpeg and object storage are available.

## Deliverables

- media-processing request and attempt model
- isolated media worker
- streaming source acquisition with checksum
- versioned FFmpeg recipes
- HLS renditions, audio, subtitles, and artwork generation
- technical validation report
- atomic Catalog publication
- public attribution generated from rights data

## Requirements

### P06-R01

Accept processing only for a current approved rights record and stable source identity.
### P06-R02

Download through a bounded stream with redirect, size, timeout, progress, and checksum controls.
### P06-R03

Store the original immutably and verify probed media against allowed policy.
### P06-R04

Run FFmpeg without shell interpolation in a resource-limited process with cancellation and cleanup.
### P06-R05

Generate a source-aware HLS ladder without upscaling, plus supported audio, captions, thumbnails, and poster variants.
### P06-R06

Version processing recipes and make source-checksum plus recipe processing idempotent.
### P06-R07

Validate playlists, referenced objects, codecs, duration, streams, captions, and representative decode.
### P06-R08

Upload outputs under an immutable publication prefix and never expose partial output.
### P06-R09

Publish through Catalog only after current rights and validation checks pass in a durable transaction.
### P06-R10

Support retry, terminal failure, cancellation, orphan cleanup, and rollback to a previous validated publication.
### P06-R11

Generate title and global attribution entries including material modification descriptions.
### P06-R12

Capture processing duration, queue time, bytes, output ratio, resource use, and classified failures.

## Invariants

- No unapproved source is downloaded by the pipeline.
- No partial manifest is publicly active.
- Original source and publication versions are immutable.
- Reprocessing never overwrites an existing publication.
- Catalog, not the worker, owns the published state.

## Implementation sequence

[ADR-0021](../adr/0021-catalog-media-requests.md) defines the implemented owner-side request boundary. [ADR-0022](../adr/0022-local-media-execution.md) implements finite acquisition and private immutable originals.

[ADR-0023](../adr/0023-isolated-media-decoder.md) implements isolated extraction/decoding and Catalog-owned private candidate retention. The first full-film HLS result is [verified locally](../../evidence/phase-06/decoder.md). [ADR-0024](../adr/0024-durable-media-processing.md) adds verified durable processing/deduplication and retained-candidate recovery. [ADR-0025](../adr/0025-derived-artwork.md) adds independently versioned, generated/inspected JPEG artwork with verified replay. Artwork approval, restricted attestation and public publication remain required.

1. Complete and preserve one rights review.
2. Define processing contracts and recipe schema.
3. Implement bounded source acquisition.
4. Implement probe and isolated FFmpeg execution.
5. Implement HLS/object layout.
6. Implement validation.
7. Integrate Catalog publication.
8. Exercise failures and cleanup.
9. Add a second title only after the first path is verified.

## Required tests

- Oversized source rejection.
- Slow or stalled source timeout.
- Checksum mismatch.
- Unsupported or malformed media.
- FFmpeg timeout and process-tree cleanup.
- Partial upload and missing segment validation.
- Idempotent retry.
- Concurrent publication and rights dispute.
- Rollback to previous publication.

## Required evidence

Store the phase evidence index under `evidence/phase-06/` when implementation begins.

- approved rights record
- source checksum and probe
- recipe version
- technical validation report
- object manifest
- representative HLS playback check
- failure and cleanup logs
- processing resource report

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Public user uploads
- DRM
- Multiple video codecs
- Live media
- Large catalog ingestion

## Exit gate

The phase is `VERIFIED` only when:

- every requirement has a linked implementation or documented non-applicability;
- all required tests pass from a clean environment;
- evidence is stored and reviewed;
- security, accessibility, failure, and operational effects are documented;
- no planned behavior is described as implemented;
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md` are current;
- the next phase prerequisites are explicitly checked.

## Learning outcomes

- Node streams and backpressure
- Process isolation
- FFmpeg orchestration
- HLS packaging
- Atomic media publication
- Rights-preserving transformation

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
