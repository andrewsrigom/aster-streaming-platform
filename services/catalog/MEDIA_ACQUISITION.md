# Local media acquisition

Catalog accepts an immutable request through `request-media`, then a finite local process acquires its exact approved source. Acquisition, isolated HLS and durable private-candidate reuse are implemented; artwork, attestation and public publication remain unfinished Phase 06 work. [ADR-0022](../../docs/adr/0022-local-media-execution.md) defines acquisition ownership, fencing and storage assumptions. [Evidence](../../evidence/phase-06/acquisition.md).

## Commands

Run from the repository root with Docker available. The example targets the existing development project; use the same project name for its database, storage and job. Do not remove unrelated containers reported as orphans by an overlay.

~~~sh
docker compose -p aster-p04-development -f infra/compose/compose.yml -f infra/compose/media.yml --profile integration --profile media build media-acquire
docker compose -p aster-p04-development -f infra/compose/compose.yml --profile integration up -d --no-deps --wait storage
docker compose -p aster-p04-development -f infra/compose/compose.yml -f infra/compose/media.yml --profile integration --profile media run --rm --no-deps --entrypoint node -e ASTER_CATALOG_ADMIN_DATABASE_URL=postgresql://aster@postgres:5432/aster -e ASTER_CATALOG_ADMIN_DATABASE_PASSWORD=aster-test-only media-acquire ./dist/src/migrate-local.js
~~~

The initializer applies additive migrations through 0006 without rewriting editorial data. Its credentials are disposable local defaults, not a hosted configuration. A separately reviewed current Catalog title is required; the request example cannot grant rights by itself. After approval:

~~~sh
docker compose -p aster-p04-development -f infra/compose/compose.yml -f infra/compose/media.yml --profile integration --profile media run --rm --no-deps --entrypoint node media-acquire ./dist/src/operate-local.js < services/catalog/examples/big-buck-bunny-media-request.json
docker compose -p aster-p04-development -f infra/compose/compose.yml -f infra/compose/media.yml --profile integration --profile media run --rm --no-deps media-acquire 00000000-0000-4000-8000-000006000003
~~~

The coordinator accepts only a request UUID, not a URL, filename, command or validation report. The local activation flags and restricted Catalog role are mandatory. A completed replay returns the durable result without another download/upload. Exit zero means successful acquisition, not playable or published media.

## Limits and storage

One global attempt may run, with three attempts/request, an eight-minute fenced lease and a seven-minute process deadline. Source size is at most 256 MiB. HTTPS has a five-minute total limit, five-second connect limit and ten-second headers/idle limits. DNS pins a public IPv4 address; TLS retains the approved hostname. Redirects, changed ETag/length, encoding, signature and checksum mismatches are refused. Rights are checked before GET, every five seconds while active and before completion; this bounds revocation exposure rather than claiming instantaneous cancellation.

The job has one CPU, 512 MiB memory, 128 MiB Node heap, 64 PIDs, 300 MiB temporary space, a read-only root and no inbound port. Only acquisition joins the media-egress bridge; the platform network stays internal. Decoding will have no network or credentials. Streams hash and copy bounded chunks to an owned private file, then conditionally PUT a SHA-256-addressed original and verify stored bytes. The local bucket is owner-private. Node RSS samples do not include all container/tmpfs memory and are not field SLO measurements.

VersityGW 1.7.0 requires the documented single-instance POSIX concurrency setting of one for these conditional writes. Do not increase it, share its data filesystem with another writer, or treat the local workaround as hosted/distributed atomicity. A real regression test covers competing writes, incorrect checksums and multipart cleanup.

## Recovery

Known transient failures consume the bounded retry budget; deterministic source/rights failures do not retry automatically. Re-run the same request after resolving a transient cause. A dead process's lease must expire; the next claim fences its late completion and records expiry. Failure-audit uncertainty is reported separately. Never delete attempts or requests to regain capacity.

Cancellation removes only the owned temporary file/directory. An uncertain PUT may retain an immutable private orphan; it cannot activate a publication. Keep originals and audit. Disable the job to roll back acquisition code; do not run an old initializer that cannot recognize schema 0005 or force a nonempty down migration. Existing HTTP readers remain compatible with the additive schema.

For the current first film, retain the complete archive and credits. The separate [decoder workflow](../../workers/media/README.md) now reuses this original and retains validated HLS privately. It uses the completed acquisition attempt ID, not the request ID. Decoding grants no technical attestation or public publication authority.

## Processing and reuse

With schema 0006 installed, run pnpm media:candidate PROJECT ACQUISITION_ATTEMPT_ID. Catalog claims a durable checksum/recipe key before preparing input, guards its 30-minute non-renewable lease and current rights throughout work, and records completion only after private retention. One processing attempt runs globally, with at most three/key. The coordinator has a shorter 29-minute deadline. Default replay independently checks retained objects and returns the same successful attempt without starting FFmpeg or rewriting media.

Add --artwork to select frame-jpeg-v1 independently of hls-avc-aac-v1. The existing processing table supports both recipes without migration. The same slot, rights guards and recovery rules apply; a JPEG candidate cannot be consumed as HLS. Keep the new coordinator while artwork audit exists: older code understands only the HLS recipe. Both outputs remain private and carry no artwork-approval or publication authority. [Artwork checkpoint](../../evidence/phase-06/artwork.md).

If a previous run retained a complete candidate but stopped before recording success, recover its exact recorded manifest/report with pnpm media:candidate PROJECT ACQUISITION_ATTEMPT_ID --reuse MANIFEST_SHA256 REPORT_SHA256. These selectors are not authority: Catalog derives the private prefix from the approved original and verifies every referenced byte before adopting it. Missing/corrupt output cannot complete the attempt. Do not guess hashes, remove audit to regain attempts, or delete retained originals/candidates. [Actual first-film adoption/replay](../../evidence/phase-06/processing.md).
