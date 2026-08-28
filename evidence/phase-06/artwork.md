# Derived artwork checkpoint

- Date: 2026-08-28
- Source: parent commit 155cefc plus the artwork slice identified by artwork-source.sha256.
- Scope: P06-R04/R05/R06/R07/R10/R12, under ADR-0025. Private computation only; no publication or artwork-rights approval is implied.

## Commands and environment

Pinned Node 24.19.0, pnpm 11.24.0 and FFmpeg 5.1.9-0+deb12u1; local Docker Desktop/WSL checkout. WSL process launching was unreliable, so scoped Docker tooling mounted the same checkout at its canonical Linux path with UID/GID 1002. No host restart, CPU benchmark, Git-hook bypass or global configuration change was used.

~~~sh
pnpm media:candidate aster-p04-development eca2fa7f-87ec-4056-9a61-2d95b6ee81d8 --artwork
# Repeat the same command once to verify durable replay.
pnpm check:source --concurrency=2
~~~

The decoder's independent synthetic entry is dist/test/integration/artwork.js, with network disabled, 1 CPU, 512 MiB and a 128 MiB work tmpfs. It generated a three-second source, produced five JPEGs twice, compared hashes and rejected cancelled/malformed work. [Raw synthetic result](artwork-synthetic.jsonl).

The PostgreSQL suite ran against an isolated pinned PostgreSQL 18.6 fixture, with the Node client sharing only that fixture's network namespace. No ports or retained database volumes were used. [Raw PostgreSQL result](artwork-postgres.jsonl). The earlier Windows-native attempt could not resolve Linux pnpm symlinks; its failure/cleanup is retained in artwork-postgres.txt. This was a tooling failure, not a failed database assertion.

## Real retained result

[Real run](artwork-real.jsonl), [default replay](artwork-replay.jsonl), [independent durable readback](artwork-readback.jsonl).

- Decoder image: sha256:c62a007f0bca3e29137e7de181e280ca3b832cebe5d9c7dd6012370e941afa02.
- Initial owner image: sha256:d7d4ff4ee614dd46f240f20bfa272c2434b8bd0800edd0987f3936cdffcc76b3.
- Replay owner image: sha256:b6c7bb192172ee83c9144bbcb483806f86eb739260babe0408dc1c662ca8b1fe; only test-source additions changed between owner builds.
- Source SHA-256: 7118242b6728d40c871479c5b3c0f0fb27d748089df15d7f1b469f297c74a2d6.
- Processing key: 08e9fe71e7a4a3587b0b3d09cdd8277d3e5e3c8b0c3b288d77e99d1d06ac13c7.
- Manifest hash: 84a672f568a7fe7ce75990a58b30fcac8ca2c1f75956e1d64ccc475ebe3db0ff.
- Report hash: 9746b8c6efd8ca473f961f348a3d11cf541a0bc59b2478d5b4850985a378ac62.
- Private bucket/prefix: aster-media-originals, candidates/PROCESSING_KEY/MANIFEST_HASH/.
- Durable attempt: 7674df29-2a04-4055-bcc8-cef60449520f, number 1, SUCCEEDED; replay returned the exact same attempt without another decoder or object write.
- Five JPEGs, 61598 bytes. Posters: 320×180 and 640×359 at 119.292 s. Thumbnails: 160×90 at 59.646, 298.230 and 506.992 s.
- Image generation/validation: 1765.961 ms; complete worker: 3427.443 ms; sampled Node peak RSS: 85233664 bytes, excluding FFmpeg/tmpfs/container memory.
- Durable execution: 43 seconds, including decoder-image preparation. The 7696-second request age includes manual staging; it is not an automated queue-latency SLO.

## Visual inspection

Downloaded only the five retained images into a private local review directory and independently checked every byte count/hash against the worker report. Inspected both poster sizes and all thumbnails. Posters show three woodland characters in a sunlit clearing, with no blank frame, unintended crop or external promotional logo. The first two thumbnails show the film's rabbit; the final thumbnail correctly shows the end credits at its timeline position. It is not a proposed poster. No resampling/re-encoding was needed after inspection.

These are film-derived JPEGs, not website/DVD-cover artwork. Future artwork attribution must identify the approved film, the extraction timestamp, resizing/JPEG conversion and the original CC BY 3.0 credit. Keep full movie credits unchanged. Actual artwork approval and publication-specific modifications remain part of the next Catalog publication boundary.

## Gates and review

[Focused tests](artwork-focused.txt): 48/48. Includes complete artwork retention/reuse, wrong-recipe refusal, unchanged HLS, malformed reports, geometry/timestamps, cancellation and existing worker process/extraction tests. PostgreSQL confirms separate recipe keys, shared single execution slot, current rights and no editorial changes. Title remains revision 2 / version 3 / RIGHTS_REVIEWED, with no publication.

[Source gate](artwork-quality.txt): 51/51 tasks, 36 cached, 87.074 seconds; Catalog 137/137 tests. [Documentation/security closeout](artwork-closeout.txt): 10/10 tasks, 5 cached, 12.545 seconds. Initial review covered recipe isolation, strict image/report grammar, current-rights replay, immutable storage and cleanup. Focused lint remediation changed tests/formatting only; confirmation found no new active-scope blocker. Final inspection found zero owned job containers or decoder scratch volumes; retained originals/candidates and serving services were untouched.

Existing acquisition/full-HLS/Web evidence remains applicable: the source and HLS recipe are unchanged; the shared input-option constant was renamed without altering its values, and the original main path now selects the identical HLS recipe from its result. No external source GET, full-film encode or Web benchmark was repeated. Failed/partial artifacts remain private; public origin, restricted technical attestation, artwork approval, truthful public attribution and final phase release remain pending.
