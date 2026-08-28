# Handoff

## Resume point

Local branch feat/p06-media-pipeline is rebased onto main f36f9aa7043dc1fe7b6394a0a800e4e842bf6865. P06-R01 is IN_PROGRESS. Phase 05 is released through PR 22 after protected CI 33132937180, code confirmation 5447217847 and post-merge CI 33133330003. No predecessor wait remains.

## Current acceptance

Phase 05 local acceptance is complete: source 58/58; all 21 distinct browser scenarios pass (20/21 first run plus isolated artifact-scan confirmation); actual Orca/Firefox evidence and clean startup/isolation are retained. Both final three-visit blocks pass unchanged budgets on image 25d53997edea8dca8afe246324bfa1eab06eb412131a4178b1308b8e60a5ef90. No more unchanged benchmarks or code review rounds for prose-only closeout.

## Current work

Big Buck Bunny now has a fully decoded private HLS candidate: 426×240 and 638×358, AAC stereo, 596.5 seconds, 203 media objects / 95430911 bytes. Actual source is 640×359 and 596.461667 seconds. Title 00000000-0000-4000-8000-000000080001 remains rights revision 2, version 3 / RIGHTS_REVIEWED, no publication. The original and extracted checksums, exact images, complete object manifest and private candidate prefix are in evidence/phase-06/decoder.md and decoder-candidate.json. All object PUTs were checksum/readback-verified before retaining the report.

## Runtime and retained data

Development Web/Router remain at 3000/4000 in aster-p04-development; Web returned HTTP 200 after acquisition. Existing serving images remain intact. Database now has migrations 0004/0005. Storage retains its volume and uses POSIX concurrency one; platform remains internal. The finite media.yml job alone joins media-egress. Its image is sha256:5c0c4cdd0c70fb0143909791e8b0179161b340e007176f96c14934e6d6fee568. Only the two stopped acquisition containers were removed; original, audit and all other programs/data remain. Do not run an older initializer against schema 0005, stop owner programs/security controls or perform global Docker cleanup.

## Next action

Durable request 00000000-0000-4000-8000-000006000003 has successful attempt eca2fa7f-87ec-4056-9a61-2d95b6ee81d8 (number 2). Attempt 1 failed before GET on internal-only DNS; the corrected job downloaded once in 12.003 s, verified stored bytes and replayed across processes without another GET. Sampled Node RSS was 97685504 bytes; this excludes tmpfs and is not an arbitrary-load promise. Evidence/phase-06/acquisition.md links real storage/PostgreSQL/CLI checks, 115 Catalog tests, exact source hashes and the final affected gate. No public endpoint or hosted pipeline was changed.

Continue P06-R01 with durable processing/deduplication and validated-result/attestation authority, then artwork and public-origin/Catalog publication. Reuse the private HLS prefix candidates/83ae3e060bd37546942997e8c6b569a6d0aa8fba08a891bdc2266ebbafe84f05/80f3b48f46729d8c84d6a5c4cc5c76c889090381c7b1acab17fbb45b1658d51c/ in aster-media-originals. Its report checksum is 23ba545346b3c19fda0a39a1d9816f3652f931ca039aefcac95587a0df4098f1. Do not repeat unchanged acquisition or full HLS processing for independent poster/attestation additions.

The current worker is workers/media under ADR-0023, with MIT yauzl 3.4.0 and the existing FFmpeg. Host entry: pnpm media:candidate PROJECT ACQUISITION_ATTEMPT_ID. It is development tooling, not yet the final Docker-only demo bootstrap. Temporary input/output volumes exist only during the coordinated job; private S3 output persists after cleanup. Initial rights still contain a pre-acquisition modification notice: derive truthful publication modifications while preserving immutable approval history. The source has no captions; never invent subtitle or artwork approval. Avoid Windows/CPU diagnostics: the owner requested direct progress on product tasks.

## Do not do yet

Do not acquire unapproved media, publish a partial manifest, invent subtitle/artwork permission or distribute binary images without the Phase 14 source/notices gate. Keep the complete Phase 00–14 goal active.
