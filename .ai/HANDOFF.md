# Handoff

## Resume point

Local branch feat/p06-media-pipeline is rebased onto main f36f9aa7043dc1fe7b6394a0a800e4e842bf6865. P06-R01 is IN_PROGRESS. Phase 05 is released through PR 22 after protected CI 33132937180, code confirmation 5447217847 and post-merge CI 33133330003. No predecessor wait remains.

Decoder/private retention is committed at 5d4e0e9; durable processing at 155cefc. The following artwork slice passes real generation, inspection, replay, focused/PostgreSQL tests and source gates. WSL command launches are unreliable, but UNC access and scoped Docker tooling provide the pinned Node/pnpm and Git. Mount at /home/andrews/personal/portfolio-2026/aster-streaming-platform with UID/GID 1002:1002 so existing dependencies and normal hooks work; the temporary image is aster-p06-tooling:git. No global Git safety change is needed. Do not repeat host diagnostics or restart owner programs.

## Current acceptance

Phase 05 local acceptance is complete: source 58/58; all 21 distinct browser scenarios pass (20/21 first run plus isolated artifact-scan confirmation); actual Orca/Firefox evidence and clean startup/isolation are retained. Both final three-visit blocks pass unchanged budgets on image 25d53997edea8dca8afe246324bfa1eab06eb412131a4178b1308b8e60a5ef90. No more unchanged benchmarks or code review rounds for prose-only closeout.

## Current work

Big Buck Bunny now has a fully decoded private HLS candidate: 426×240 and 638×358, AAC stereo, 596.5 seconds, 203 media objects / 95430911 bytes. Actual source is 640×359 and 596.461667 seconds. Title 00000000-0000-4000-8000-000000080001 remains rights revision 2, version 3 / RIGHTS_REVIEWED, no publication. The original and extracted checksums, exact images, complete object manifest and private candidate prefix are in evidence/phase-06/decoder.md and decoder-candidate.json. All object PUTs were checksum/readback-verified before retaining the report.

## Runtime and retained data

Development Web/Router remain at 3000/4000 in aster-p04-development; serving images were not changed. Database remains at migration 0006. Storage retains its volume and uses POSIX concurrency one; platform remains internal. Acquisition alone joins media-egress; the decoder has no network. Latest finite coordinator image is sha256:b6c7bb192172ee83c9144bbcb483806f86eb739260babe0408dc1c662ca8b1fe; retain its support for both processing recipes. Originals, candidates, audit and owner programs remain. No job containers or scratch volumes remain. Do not stop owner programs/security controls or perform global Docker cleanup.

## Next action

Newest slice: [publication foundation](../evidence/phase-06/publication-foundation.md), ADR-0026. Original reuse requires `AcquisitionApproval.reuseApproved`, derived from the current approved rights checksum under the existing lock; a request checksum alone is insufficient. Exact local-media URLs are admitted only by the explicit local policy. The S3 read-only origin, bucket/CORS initializer and Docker-only `pnpm media:origin:test` are verified with synthetic bytes; the retained origin is not started and title/database/candidate state below is unchanged. Build-stage test image is `aster-media-origin-test:local`; this is a test cache, not a release. Tooling checks need `/tmp:rw,exec,nosuid,nodev,size=128m` and `NODE_OPTIONS=--max-old-space-size=1536` with a 2 GiB cap (otherwise synthetic shell/whole-workspace lint fails). No host investigation is needed.

Continue with bundle identity bound to both candidate reports and stable attribution facts, excluding final asset URLs to avoid a hash cycle. Preview derivative metadata, use existing retire/reopen/edit/review commands with inspected versions to preserve review history, then a new current-checksum request can reuse the retained original and both recipe results. Add a separate technical-attester role/function that serializes against title rights changes without granting editorial writes, then existing media-ready/publish. No attestation schema/function exists yet; migration 0007 is the next free number. Verify adverse publication/rollback behavior before completing Phase 06.

Latest checkpoint: [derived artwork](../evidence/phase-06/artwork.md). Attempt 7674df29-2a04-4055-bcc8-cef60449520f retains five inspected JPEGs (61598 bytes), under processing key 08e9fe71e7a4a3587b0b3d09cdd8277d3e5e3c8b0c3b288d77e99d1d06ac13c7 and manifest 84a672f568a7fe7ce75990a58b30fcac8ca2c1f75956e1d64ccc475ebe3db0ff. Report checksum 9746b8c6efd8ca473f961f348a3d11cf541a0bc59b2478d5b4850985a378ac62. Replay returns the same attempt; HLS/title state are unchanged. Next implement restricted attestation, actual artwork approval, publication-specific attribution and immutable public delivery. Keep existing rights history; generation alone is not editorial approval.

Durable request 00000000-0000-4000-8000-000006000003 has successful attempt eca2fa7f-87ec-4056-9a61-2d95b6ee81d8 (number 2). Attempt 1 failed before GET on internal-only DNS; the corrected job downloaded once in 12.003 s, verified stored bytes and replayed across processes without another GET. Sampled Node RSS was 97685504 bytes; this excludes tmpfs and is not an arbitrary-load promise. Evidence/phase-06/acquisition.md links real storage/PostgreSQL/CLI checks, 115 Catalog tests, exact source hashes and the final affected gate. No public endpoint or hosted pipeline was changed.

Durable HLS processing remains verified under ADR-0024. Attempt 68e41f87-ca12-44ff-96d3-8a9e66d67795 adopted and replayed the existing private candidate; see evidence/phase-06/processing.md. Reuse candidates/83ae3e060bd37546942997e8c6b569a6d0aa8fba08a891bdc2266ebbafe84f05/80f3b48f46729d8c84d6a5c4cc5c76c889090381c7b1acab17fbb45b1658d51c/ in aster-media-originals, report checksum 23ba545346b3c19fda0a39a1d9816f3652f931ca039aefcac95587a0df4098f1. Do not repeat unchanged acquisition/HLS processing for independent attestation additions.

The current worker is workers/media under ADR-0023, with MIT yauzl 3.4.0 and the existing FFmpeg. Host entry: pnpm media:candidate PROJECT ACQUISITION_ATTEMPT_ID. It is development tooling, not yet the final Docker-only demo bootstrap. Temporary input/output volumes exist only during the coordinated job; private S3 output persists after cleanup. Initial rights still contain a pre-acquisition modification notice: derive truthful publication modifications while preserving immutable approval history. The source has no captions; never invent subtitle or artwork approval. Avoid Windows/CPU diagnostics: the owner requested direct progress on product tasks.

## Do not do yet

Do not acquire unapproved media, publish a partial manifest, invent subtitle/artwork permission or distribute binary images without the Phase 14 source/notices gate. Keep the complete Phase 00–14 goal active.
