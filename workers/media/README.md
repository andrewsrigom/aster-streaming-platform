# Local media candidate

This finite worker extracts and validates an approved original, then produces full-length H.264/AAC HLS or independently versioned JPEG artwork. It has no publication authority. Catalog owns rights and retains verified candidate bytes privately; public delivery and attestation are still unfinished Phase 06 work.

## Run

After Catalog approval and successful acquisition in the same local project:

~~~sh
pnpm media:candidate aster-p04-development eca2fa7f-87ec-4056-9a61-2d95b6ee81d8
pnpm media:candidate aster-p04-development eca2fa7f-87ec-4056-9a61-2d95b6ee81d8 --artwork
~~~

The argument is the completed acquisition attempt ID, not the request ID. With Catalog schema 0006, the command claims durable processing and checks current rights. On fresh work it builds the decoder, copies the verified private original, runs without network/credentials, verifies stored objects and retains the report last. Completed checksum/recipe work instead verifies and reuses the stored candidate without starting FFmpeg. It never downloads the external source again. Remote Docker overrides and CI execution are refused.

The host runner is development tooling; it is not yet the final Docker-only demo bootstrap. Its guarded coordinator keeps bounded tmpfs input/output volumes mounted until retention completes. It stops a decoder whose owner fails. Cleanup checks exact run/project labels and removes only the job containers and scratch volumes; originals, private candidate objects, audit and serving services remain.

Do not rerun a successful full transcode for unchanged code. Catalog implements cross-run deduplication, one global processing slot, three attempts/checksum-recipe and 30-minute non-renewable leases. A crash after retention but before durable completion can recover the exact recorded candidate using the optional --reuse MANIFEST_SHA256 REPORT_SHA256 arguments. This performs bounded independent storage verification, not caller-approved attestation. See [processing evidence and commands](../../evidence/phase-06/processing.md). Failed uploads may leave private immutable objects, not an active public manifest.

## Verification

The --artwork option selects frame-jpeg-v1: source-capped 320/640-wide landscape posters at 20%, plus three 160-wide thumbnails at 10/50/85%. Images are decoded/probed/hashed and retained under their own processing key. Repeat the same command to replay; recovery selectors follow --artwork when needed. This does not change or re-encode an existing HLS candidate. Inspect the actual images and approve derivative rights separately before editorial use. [Artwork evidence](../../evidence/phase-06/artwork.md).

~~~sh
pnpm --filter=@aster/media build
pnpm --filter=@aster/media test
pnpm media:test
pnpm catalog:integration
~~~

The independent synthetic integration entries are dist/test/integration/encode.js and dist/test/integration/artwork.js inside the decoder image, executed with network-disabled/resource-limited configuration. The [real-film evidence](../../evidence/phase-06/decoder.md) records exact images, streams, checksums, output and limitations. [ADR-0023](../../docs/adr/0023-isolated-media-decoder.md) defines extraction, codec, process and retention controls.

## Remaining publication conditions

No captions are invented: the reviewed source contains only video and audio. Derived posters/thumbnails are generated and inspected; formal artwork approval remains. Record actual transformations in public attribution without rewriting historical rights approval. Restricted technical attestation and an actual CDN-compatible media origin remain required before declaring playable or published VOD.
