# Skill: Media Streaming

## Purpose

Ingest, transform, validate, publish, and play media without mixing rights, editorial, processing, and delivery responsibilities.

## Lifecycle

```text
candidate
→ rights reviewed
→ source acquired
→ source verified
→ processing
→ technical validation
→ editorial approval
→ published
→ retired
```

No transition may skip rights review or technical validation.

## Source acquisition

For every source:

- fetch from the recorded official location;
- enforce size and duration limits;
- calculate checksum while streaming;
- keep the original immutable;
- capture technical metadata;
- record acquisition time and tool version;
- reject unexpected redirects or content types according to policy.

## Processing

Media processing runs outside request-serving services.

Use FFmpeg through direct process arguments. Enforce:

- execution deadline;
- CPU and memory limits;
- disk quota;
- temporary-directory isolation;
- output allowlist;
- bounded logs;
- cancellation and cleanup;
- retry classification.

## Renditions

The initial ladder should be conservative and derived from source quality. Never upscale solely to fill a ladder.

Each rendition records:

- codec;
- dimensions;
- frame rate;
- target and measured bitrate;
- audio codec and channels;
- segment duration;
- checksum;
- processing recipe version.

## HLS publication

Publish atomically:

1. upload segments and child playlists under an immutable version prefix;
2. validate every referenced object;
3. upload the master playlist;
4. update the durable active-publication pointer;
5. invalidate only stable metadata paths when needed.

Clients should never observe a manifest that references missing segments.

## Delivery

Application services issue playback authorization and references. They do not proxy segment bytes.

Use CDN-compatible caching headers. Keep originals private. Signed delivery, if used, must be short-lived and compatible with asset rights.

## Playback telemetry

Track experience rather than raw viewing identity:

- session created;
- manifest loaded;
- first frame;
- rendition switches;
- rebuffer events;
- fatal media errors;
- completion.

Define sampling and retention before collection.
