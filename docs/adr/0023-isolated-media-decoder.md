# ADR-0023: Isolated Full-Length Media Decoder

- Status: Accepted
- Date: 2026-08-28
- Requirements: P06-R03–R07, P06-R10, P06-R12

## Decision

Implement the existing asynchronous media capability as a finite strict TypeScript workspace at `workers/media`. Catalog retains all rights, attempt and publication authority. The decoder has no database or object-storage dependency, network, credentials, Docker socket or editorial write. An owner coordinator must authorize the current request before handing it the verified immutable original and recheck before accepting output. A checksum and decoder report are identity/integrity evidence, not permission or an attestation.

For ZIP sources use pinned MIT yauzl 3.4.0 with lazy central-directory enumeration, strict names and entry-size validation. Inspect at most 32 entries; allow only bounded directories and one MP4/M4V regular file, not symlinks, encryption, traversal or additional payloads. Never use an entry name as a destination path. Extract into an exclusive owned file with a 256 MiB expansion ceiling, ratio ceiling 20, deadline, backpressure, CRC-32 and separate SHA-256. Verify the archive checksum first. Keep all bytes outside Git.

Probe and encode with the existing pinned Debian FFmpeg executable through argument arrays. Accept one bounded H.264 video and one mono/stereo AAC track in MP4, square pixels, no rotation, and at most one hour. Unexpected tracks/codecs require an explicit policy review instead of silently discarding them. Version `hls-avc-aac-v1` preserves full duration/credits, selects at most three no-upscale renditions (240/360/720 height ceilings), uses six-second independent MPEG-TS segments and muxed AAC. Do not fabricate captions or language/rights metadata. Supported captions and reviewed derived artwork remain required Phase 06 work.

Run one decoder at a time with no network, read-only root/input, non-root UID, dropped capabilities, no-new-privileges, one CPU, 64 PIDs, 128 MiB Node heap and a 1 GiB container memory ceiling. Use an owned 768 MiB work tmpfs and separately bounded candidate output; allow up to 30 minutes for the full local job. Child deadlines/cancellation kill the owned process group and await close; the outer container remains the hard isolation/cleanup boundary. These limits are not speed promises on a busy shared host.

Validate generated playlists against the exact local filename grammar before decoding them; bound object count/size, hash outputs, verify the entire timeline and record actual dimensions/bitrate/duration. Probe both output streams and representative segment keyframes. FFmpeg can skip a missing HLS segment even with `-xerror`, so explicit object existence/integrity checks are mandatory. Write the candidate report last. Interrupted/invalid candidates cannot be published.

Odd display dimensions are valid input: the actual first film is 640×359, not the filename's nominal 640×360. Cap each ladder height to the source's even dimensions and deduplicate; it produces 426×240 and 638×358 without cropping or upscaling. Normalize output to the probed rational frame rate only when its measured average is within 0.1 fps; this handles the 24/1 stream's fractional terminal timestamp. The one-second rights check applies while waiting for decoding; upload checks occur between bounded objects and before final completion.

The local host orchestrator starts a finite Catalog coordinator and the decoder in the same scoped workflow. Catalog rechecks the completed acquisition's current authority before and after copying the original, then keeps the input/output tmpfs volumes mounted while checking rights every second. If the owner fails, the orchestrator stops the decoder. The decoder's report is atomically renamed only after validation. Catalog independently checks the report identity, bounded file allowlist, sizes and conditional S3 checksums/readback, retaining the candidate and report under a content-addressed private prefix in the existing originals bucket. The report is stored last; it grants no publication authority. The scratch mounts may be removed after retention without losing the candidate. Docker labels and exact targets fence cleanup; retained originals, candidates, databases and serving containers are not deleted.

This finite workflow does not yet implement durable processing leases, cross-run recipe deduplication or attestation registration. A failed upload may leave only private immutable objects; no public pointer changes. Those remaining controls are required before Phase 06 can be verified.

## Dependencies and recovery

The supervisor finishes bounded image builds before starting the owner or its 30-minute processing deadline. Each build has its own six-minute limit. Explicit retained-candidate reuse builds only the owner. Cold image preparation no longer spends the processing lease/window; encoding speed on a shared host is not promised.

Scratch volumes now include the non-reused run UUID in their Docker names, while Compose keeps stable input/output mount keys. Recovery takes an explicit project/run and defaults to inspection. It can remove only run-labelled, stopped containers and exact local tmpfs volumes at least 31 minutes old, after checking that no foreign container references them. Removal uses immutable container IDs and never force; run-specific volume names prevent a new attempt from inheriting a cleanup target. Unknown/legacy unscoped volumes are not automatically removed. This handles abandoned temporary output without deleting immutable originals/candidates, publication bundles or durable attempts. Content-addressed S3 partials remain recoverable through the existing verified replay; scratch cleanup is not a claim of implemented storage lifecycle garbage collection.

Yauzl 3.4.0 declares Node >=12 and MIT; its runtime dependency is MIT pend 1.2.0. Preserve upstream notices and exact lockfile integrity. The library does not verify CRC-32, so the decoder does, using the pinned Node 24 runtime. FFmpeg binary distribution remains governed by ADR-0016; Aster source remains MIT.

Remove only an owned failed candidate after recording the failure. Retain the immutable original and Catalog audit. Existing HTTP services/images do not need FFmpeg and remain unaffected.

Sources: [yauzl API and limits](https://github.com/thejoshwolfe/yauzl/blob/3.4.0/README.md), [yauzl MIT license](https://github.com/thejoshwolfe/yauzl/blob/3.4.0/LICENSE), [FFmpeg HLS muxer](https://ffmpeg.org/ffmpeg-formats.html#hls-2), [binary compliance decision](0016-isolated-generated-media-fixture.md).

Scratch naming/removal: [Compose custom volume names](https://docs.docker.com/reference/compose-file/volumes/#name), [Docker volume removal](https://docs.docker.com/reference/cli/docker/volume/rm/). Docker also refuses a volume still referenced by a container; the CLI does not override that guard.
