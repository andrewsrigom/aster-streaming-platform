# ADR-0025: Independently versioned derived artwork

- Status: Accepted
- Date: 2026-08-28
- Phase: 06
- Requirements: P06-R04, P06-R05, P06-R06, P06-R07, P06-R10, P06-R11

## Context

The approved original and full HLS candidate are retained privately. Posters and thumbnails are still required; adding them must not invalidate that completed HLS recipe or imply rights approval for unrelated promotional assets.

## Decision

Add `frame-jpeg-v1` as the second concrete recipe in the existing worker and Catalog processing coordinator. The source-checksum/recipe key, single running slot, lease, retry budget, current-rights checks and private candidate retention remain the same. The current JSON processing record supports this without a migration; its strict application normalizer admits exactly the two recipes. The approved acquisition request continues to identify the original source, not an arbitrary caller-supplied executable.

The fixed recipe derives landscape posters at 320/640 pixels wide, capped to source width, from 20% of the film. Three 160-pixel-wide thumbnails sample 10%, 50% and 85%. Preserve aspect ratio with nearest-pixel rounding, never upscale or crop, and deduplicate capped poster dimensions. Each JPEG is independently probed, decoded and hashed; only fixed filenames and a complete report are retained. Five images maximum, 2 MiB each, no external artwork download. There is no automatic claim that these sampling heuristics choose a good poster: inspect the actual frames before editorial use.

The decoder remains network-disabled and receives no storage/database credentials. Catalog chooses one of the two recipes, validates the matching report grammar and records the private result. Generation is not an artwork-rights approval or a technical publication attestation. Subsequent editorial publication must record derivative rights and accurate modifications, preserving the film's original approval history and full end credits.

## Verification and recovery

Test no-upscale bounds, timestamps, strict image/object grammar, malformed output, cancellation, recipe-key isolation and backward compatibility. Run real FFmpeg on a short generated source and derive the first film's images from the retained original, then replay the same durable result without another decode/write. Existing HLS/source evidence is retained because its recipe is unchanged. Do not repeat the film encode for independent artwork edits.

Rollback is code-only while no artwork attempt exists. Once artwork attempts exist, retain support for reading their recipe and roll forward; do not deploy an older processing coordinator that cannot read that audit history. No active publication or prior media object is overwritten.
