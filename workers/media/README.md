# Local media candidate

This finite worker extracts and validates an approved original, then produces full-length H.264/AAC HLS. It has no publication authority. Catalog owns rights and retains verified candidate bytes privately; public delivery and attestation are still unfinished Phase 06 work.

## Run

After Catalog approval and successful acquisition in the same local project:

~~~sh
pnpm media:candidate aster-p04-development eca2fa7f-87ec-4056-9a61-2d95b6ee81d8
~~~

The argument is the completed acquisition attempt ID, not the request ID. The command builds its two images, checks current rights, copies the verified private original, runs the decoder without network/credentials, verifies each stored object and retains the report last. It never downloads the external film source again. Remote Docker overrides and CI execution are refused.

The host runner is development tooling; it is not yet the final Docker-only demo bootstrap. Its guarded coordinator keeps bounded tmpfs input/output volumes mounted until retention completes. It stops a decoder whose owner fails. Cleanup checks exact run/project labels and removes only the job containers and scratch volumes; originals, private candidate objects, audit and serving services remain.

Do not rerun a successful full transcode for unchanged code. Cross-run durable processing deduplication and processing-attempt recovery are still pending. A private candidate can be reused for the remaining validation/publication work. Failed uploads may leave private immutable objects, not an active public manifest.

## Verification

~~~sh
pnpm --filter=@aster/media build
pnpm --filter=@aster/media test
pnpm media:test
pnpm catalog:integration
~~~

The independent synthetic integration entry is `dist/test/integration/encode.js` inside the decoder image, executed with the same network-disabled/resource-limited configuration. The [real-film evidence](../../evidence/phase-06/decoder.md) records exact images, streams, checksums, output and limitations. [ADR-0023](../../docs/adr/0023-isolated-media-decoder.md) defines extraction, codec, process and retention controls.

## Remaining publication conditions

No captions are invented: the reviewed source contains only video and audio. Derived posters/thumbnails still require generation, inspection and artwork review. Record actual transformations in public attribution without rewriting historical rights approval. Add durable processing/attestation ownership and an actual CDN-compatible media origin before declaring playable or published VOD.
