# Isolated full-film HLS candidate

Status: implemented and locally verified for the selected source; Phase 06 remains IN_PROGRESS. No Catalog publication, browser playback or hosted release is claimed.

## Environment and command

2026-08-28, local Windows/WSL Docker project `aster-p04-development`, branch `feat/p06-media-pipeline` after acquisition commit `35e2aaa`. Exact later source is captured in `decoder-source.sha256`; [candidate output](decoder-candidate.json) records the build image IDs and complete object manifest. Log records are pretty-printed as a JSON array to remain within the secret scanner's line-size bound; values are unchanged.

~~~sh
pnpm media:candidate aster-p04-development eca2fa7f-87ec-4056-9a61-2d95b6ee81d8
~~~

Decoder image: `sha256:fe09476074e86ef204262e575bc0069159b7fd8546888ba3623244550843bd4f`. Coordinator image: `sha256:fa2cc071e29e5b09d810d638bd44c36b2620fd2024c42fff89255f0dac86181d`. FFmpeg 5.1.9-0+deb12u1 remains an isolated executable. No HTTP serving image was replaced and no external source GET was repeated.

## Source and result

The retained archive SHA-256 is `7118242b6728d40c871479c5b3c0f0fb27d748089df15d7f1b469f297c74a2d6`, 121284117 bytes. It contains one regular entry, `BigBuckBunny_640x360.m4v`, 121283919 bytes, extracted SHA-256 `738e2f999860553d056dd79c952f58f63cbb73892a57c72342ce9e5330d9d2d7`. Streaming size, CRC and archive/extracted checksums pass.

Actual input is H.264, 640×359, 24/1 fps, AAC stereo at 44100 Hz, 596.461667 seconds. The filename's 360p label is not a measured dimension. The initial strict even-input policy rejected it before encoding; [that rejection](decoder-source-policy.jsonl) is retained. The recipe now accepts valid odd input dimensions, rounds output down without upscaling/cropping and normalizes near-constant source timestamps. The input has no caption stream.

The full film becomes 426×240 and 638×358 H.264 High/level 4.2 with AAC stereo/48000 Hz. Each rendition has 100 segments and a validated 596.5-second timeline. The process hashes every object, validates playlist references, probes output streams and representative keyframes, and fully decodes each rendition. Total: 203 media objects, 95430911 bytes, plus the separately checksummed report.

Private bucket: `aster-media-originals`.

~~~text
candidates/83ae3e060bd37546942997e8c6b569a6d0aa8fba08a891bdc2266ebbafe84f05/80f3b48f46729d8c84d6a5c4cc5c76c889090381c7b1acab17fbb45b1658d51c/
~~~

Report checksum: `23ba545346b3c19fda0a39a1d9816f3652f931ca039aefcac95587a0df4098f1`. Every conditional PUT/conflict is followed by complete byte/checksum readback. Catalog rights are checked before/after original handoff, during decoding and between uploads; the report is retained last. Neither worker flags nor this private report can insert a publication.

[Independent post-cleanup S3 read](decoder-stored.jsonl) confirms 204 retained objects including the 24665-byte report, its exact checksum and owner-private bucket ACL. [Catalog readback](decoder-catalog.jsonl) confirms version 3 / rights revision 2 / RIGHTS_REVIEWED with no publication.

## Checks and review

- 23 worker tests cover stored/deflated ZIP, CRC/size/hash/signature failures, traversal/symlinks, expansion, duplicate/count bounds, overwrite refusal, input/playlist policy, process deadlines/cancellation, bounded logs and process-group cleanup.
- Nine new Catalog handoff tests cover authority before side effects, checksum failure cleanup, private retention/replay, partial-upload refusal, tampered reports and symlinked output. Existing Catalog execution tests remain passing.
- [Real PostgreSQL confirmation](decoder-postgres.jsonl) verifies completed-original access, denial after a subsequent rights dispute, existing recovery/concurrency/privilege boundaries and full fixture cleanup.
- A 13-second synthetic encode proved both output qualities and full decode before the film. FFmpeg did not itself reject a missing segment, so the test and implementation require explicit object integrity/existence checks.
- Initial review corrected stderr capture, tmpfs ownership/lifetime, short-title target duration, atomic report visibility, bounded report reads, stale-rights reuse, and exact cleanup targets. A real missing-attempt run using the final host guards failed before decoding and removed its run-owned scratch; no media was regenerated. The later host guards/tests/prose do not invalidate the successful HLS output.
- The final affected source gate passed 61/61 tasks (31 cached, 91.477 seconds), recorded in `decoder-quality.txt`. Initial failures (source-only Docker allowlist, a test's expected version after its own explicit dispute, and the raw manifest exceeding the secret scanner's line-size bound) were corrected, not waived.

## Measurements and limitations

The full encode/validation took 194647.844 ms; total decoder execution was 196506.434 ms. Output/source ratio was 0.78684. Sampled Node RSS peaked at 87777280 bytes; the raw report also records heap, external and array-buffer peaks. These are this job's measurements, not total FFmpeg/container memory, a leak claim or field SLO evidence. The job has no network, one CPU, 1 GiB memory, bounded tmpfs, 64 PIDs and a non-root read-only root. No new Windows baseline or unchanged Web benchmark was run.

The title remains RIGHTS_REVIEWED with no publication. Still required: durable processing lease/deduplication, reviewed artwork, actual transformation attribution, trusted validation/attestation registration, immutable public-origin delivery, publication/rollback and browser playback acceptance. Retain this candidate and reuse its unchanged HLS evidence instead of regenerating it for those independent additions.
