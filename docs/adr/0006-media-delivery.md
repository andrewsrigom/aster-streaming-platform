# ADR-0006: Deliver Immutable HLS Publications through Object Storage and CDN

- Status: Accepted
- Date: 2026-08-25
- Related requirements: MED-R03–R06, PBK-R03

## Context

Aster must provide adaptive playback without making Node.js services carry media bandwidth. Publication must avoid manifests that reference incomplete output.

## Decision

Generate HLS VOD packages in an isolated worker. Store originals and immutable publication versions in S3-compatible object storage. Deliver validated manifests and segments through a CDN.

Application services issue playback sessions and delivery references but do not proxy media bytes.

Publish by uploading all versioned objects, validating references, then atomically changing Catalog's active-publication pointer.

## Consequences

### Positive

- Adaptive playback and edge caching.
- Application scaling is independent of video bitrate.
- Immutable versions simplify rollback and cache behavior.
- Partial output remains private.

### Negative

- Transcoding and storage multiply cost.
- Browser/device compatibility requires testing.
- CORS, MIME, cache, and origin configuration are critical.
- Rights policy must remain compatible with delivery controls.

## Alternatives considered

### Progressive MP4 only

Useful for an early technical spike but insufficient for the release requirement.

### Node.js streaming proxy

Rejected because it couples API capacity to media bandwidth and complicates range, caching, and failure behavior.

### DASH as the initial format

Deferred. HLS offers a focused first implementation; additional packaging requires evidence.

## Revisit triggers

Add codecs or formats when device support, bandwidth, or cost evidence justifies their complexity.
