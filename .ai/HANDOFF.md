# Handoff

## Resume point

Local branch feat/p06-media-pipeline is rebased onto main f36f9aa7043dc1fe7b6394a0a800e4e842bf6865. P06-R01 is IN_PROGRESS. Phase 05 is released through PR 22 after protected CI 33132937180, code confirmation 5447217847 and post-merge CI 33133330003. No predecessor wait remains.

## Current acceptance

Phase 05 local acceptance is complete: source 58/58; all 21 distinct browser scenarios pass (20/21 first run plus isolated artifact-scan confirmation); actual Orca/Firefox evidence and clean startup/isolation are retained. Both final three-visit blocks pass unchanged budgets on image 25d53997edea8dca8afe246324bfa1eab06eb412131a4178b1308b8e60a5ef90. No more unchanged benchmarks or code review rounds for prose-only closeout.

## Current work

Big Buck Bunny's official 640x360 archive is approved and acquired: title 00000000-0000-4000-8000-000000080001, rights revision 2, version 3 / RIGHTS_REVIEWED, no publication. The private original has 121284117 bytes and SHA-256 7118242b6728d40c871479c5b3c0f0fb27d748089df15d7f1b469f297c74a2d6. S3 bucket aster-media-originals, key originals/sha256/ plus that hash. No extraction, probe or HLS yet. Historical reviews remain unchanged; current Catalog rights, not an evidence snapshot, authorize later processing.

## Runtime and retained data

Development Web/Router remain at 3000/4000 in aster-p04-development; Web returned HTTP 200 after acquisition. Existing serving images remain intact. Database now has migrations 0004/0005. Storage retains its volume and uses POSIX concurrency one; platform remains internal. The finite media.yml job alone joins media-egress. Its image is sha256:5c0c4cdd0c70fb0143909791e8b0179161b340e007176f96c14934e6d6fee568. Only the two stopped acquisition containers were removed; original, audit and all other programs/data remain. Do not run an older initializer against schema 0005, stop owner programs/security controls or perform global Docker cleanup.

## Next action

Durable request 00000000-0000-4000-8000-000006000003 has successful attempt eca2fa7f-87ec-4056-9a61-2d95b6ee81d8 (number 2). Attempt 1 failed before GET on internal-only DNS; the corrected job downloaded once in 12.003 s, verified stored bytes and replayed across processes without another GET. Sampled Node RSS was 97685504 bytes; this excludes tmpfs and is not an arbitrary-load promise. Evidence/phase-06/acquisition.md links real storage/PostgreSQL/CLI checks, 115 Catalog tests, exact source hashes and the final affected gate. No public endpoint or hosted pipeline was changed.

Continue P06-R01 with bounded ZIP extraction/probe, isolated FFmpeg recipes and verified-result/attestation authority. Reuse the immutable original, not another source download. Research found MIT yauzl 3.4.0 with one dependency and matching types; it is not installed/selected yet. Validate actual archive members, signatures, expansion and streams before decoding. Keep decoder network-disabled with no DB/S3 credentials or Docker socket. Initial rights still contain the pre-acquisition modification notice: actual transformations, complete credits and any artwork/caption rights must be resolved before publication. Do not let caller-provided flags register technical validation. No unchanged acquisition/Web experiment is needed for decoder-only work.

## Do not do yet

Do not acquire unapproved media, publish a partial manifest, invent subtitle/artwork permission or distribute binary images without the Phase 14 source/notices gate. Keep the complete Phase 00–14 goal active.
