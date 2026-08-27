# ADR-0016: Isolated Generated HLS Fixture

- Status: Accepted
- Date: 2026-08-27
- Requirements: P03-R04; supports Phase 05 tests and Phase 06 validation

## Decision

Generate six seconds of technical video, a sine-wave audio track and project-authored captions in a finite, network-disabled Docker job. Use Debian FFmpeg 7:5.1.9-0+deb12u1 on the already pinned Node Bookworm image. Preserve Debian package copyright notices. FFmpeg is a separate executable, never linked into Aster code or installed in request-serving images.

The source is generated FFV1/PCM Matroska, then H.264/AAC HLS with two-second segments. Hash actual source/output bytes, validate local references and decode the package. Compare two independent generations in the same image. This proves repeatability for that build/architecture, not bitwise portability across all hardware or future package rebuilds. Record the image ID and tool versions in evidence.

The fixture is synthetic, not an approved catalog film. Its source recipe and captions use the repository MIT license; test signals contain no acquired film, music, marks or personal information. Synthetic Catalog rights and HTTPS `.invalid` publication references may be used only in explicit local technical tests. They do not claim reachable CDN delivery, third-party permission or production publication. Real source acquisition and worker handoff remain Phase 06.

## License scope

[FFmpeg's license page](https://ffmpeg.org/legal.html) explains that optional GPL components change the FFmpeg binary's license. Debian's build includes GPL components such as x264; do not call that binary MIT or LGPL-only. Aster-authored material remains MIT. Local builds do not publish this image. Before distributing a binary image, provide corresponding source and notices for the actual binary and its dependencies through the release compliance gate; a source-page link alone is not claimed to satisfy binary-distribution obligations.

[Debian's package record](https://packages.debian.org/bookworm/ffmpeg) provides the selected version, copyright file and corresponding source package. The recipe uses the [documented HLS muxer](https://ffmpeg.org/ffmpeg-formats.html#hls-2). Container package resolution and codec patent clearance for a commercial hosted release are not established by a local functional test.

## Consequences and recovery

No external media is needed for fast publication-contract tests. The isolated job has CPU, memory, PID, disk, output and elapsed-time bounds. Invalid output cannot create an attestation. Discard only its owned ephemeral output on failure. Keep actual media bytes outside Git; retain recipe, notices, checksums and sanitized reports. The Phase 06 worker will replace the fixture authority, not bypass Catalog publication checks.
