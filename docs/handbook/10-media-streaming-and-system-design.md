# Media Streaming and System Design

## Purpose

A streaming platform has two different systems:

- a control plane that decides what can be viewed;
- a data plane that delivers large media bytes.

Confusing them produces expensive and fragile architecture.

## 1. Control plane

The control plane includes:

- catalog;
- rights;
- profiles;
- playback sessions;
- watchlist and progress;
- search and discovery;
- telemetry and administration.

Its requests are relatively small and latency-sensitive.

## 2. Data plane

The data plane includes:

- master playlists;
- rendition playlists;
- video and audio segments;
- subtitles;
- posters and thumbnails;
- object storage;
- CDN;
- origin access.

Its traffic is dominated by bandwidth and cache behavior.

Node.js services should not proxy this traffic.

## 3. HLS structure

```text
master.m3u8
├─ 360p playlist
│  ├─ segment 1
│  ├─ segment 2
│  └─ ...
├─ 720p playlist
├─ 1080p playlist
├─ audio playlists
└─ subtitle references
```

The player selects a rendition based on measured throughput, buffer, viewport, and player policy.

## 4. Segment duration trade-off

Shorter segments:

- adapt faster;
- reduce seek granularity;
- create more requests and metadata;
- can reduce startup unit size.

Longer segments:

- reduce request overhead;
- adapt more slowly;
- may increase startup and recovery cost.

Choose from playback evidence and CDN behavior. Align keyframes with segment boundaries.

## 5. Encoding ladder

A ladder balances:

- source quality;
- display sizes;
- network distribution;
- codec efficiency;
- encode compute;
- storage;
- device support.

Do not create 1080p from a 720p source. Do not assume one bitrate fits animation and live action equally.

Start conservative, measure visual quality and rebuffering, then tune.

## 6. Publication atomicity

The media worker writes immutable objects. Catalog changes one durable active pointer only after validation.

This avoids:

```text
client loads master
→ child playlist exists
→ referenced segment is still uploading
→ playback fails
```

Rollback selects a previous immutable publication.

## 7. Playback authorization

For public open media, a session can still provide:

- publication version;
- telemetry identity;
- expiry;
- rate control;
- delivery configuration.

It must not impose restrictions incompatible with content rights.

The CDN can serve immutable public objects while the control plane governs discovery and current publication. Retiring a title may require stable-reference invalidation and policy decisions about already cached public licensed assets.

## 8. Capacity math

Concurrent playback bandwidth:

```text
bandwidth = concurrent viewers × average delivered bitrate
```

Progress writes:

```text
writes per second
= active viewers / reporting interval
```

Segment request rate approximation:

```text
requests per second
≈ concurrent viewers / segment duration
```

Multiply by audio and playlist requests as applicable.

These formulas establish order of magnitude. Real player behavior, cache hit, retries, startup bursts, and rendition changes require measurement.

## 9. Continue-watching at larger scale

A player sends ordered progress events. The durable owner enforces monotonic sequence.

At moderate scale:

```text
player
→ GraphQL mutation
→ Engagement PostgreSQL
→ outbox
→ projections
```

At much larger write volume, safe evolution may include:

```text
player
→ regional ingest
→ partitioned event log
→ progress compactor
→ durable state
→ read model
```

The invariants remain:

- authenticated profile;
- idempotency;
- per-profile-title ordering;
- no false acknowledgement;
- bounded staleness;
- deletion propagation.

Do not adopt asynchronous acknowledgement without deciding what the viewer is promised.

## 10. CDN behavior

Versioned media objects:

- long cache lifetime;
- immutable;
- content type correct;
- origin protected.

Stable metadata or active pointers:

- shorter cache;
- explicit invalidation;
- version-aware.

Observe:

- edge hit ratio;
- origin requests;
- 4xx and 5xx;
- range behavior;
- bytes;
- regional latency;
- manifest versus segment failures.

## 11. Multi-region reasoning

CDN already distributes media globally. The first control-plane regional problem is often API latency and availability, not video delivery.

Evolution path:

1. single write region;
2. global CDN;
3. read replicas or regional read models;
4. regional stateless request services;
5. explicit failover;
6. only then consider multi-region writes per context.

Progress may accept eventual regional convergence under a defined monotonic conflict model. Rights and publication changes usually favor one authoritative writer.

## 12. Cost model

Major cost drivers:

- video egress;
- storage of originals and renditions;
- transcoding compute;
- observability volume;
- managed database;
- idle distributed services.

Architecture optimization includes cost per playback hour and per processed title, not only response latency.

## 13. System-design checklist

- define user journey;
- separate control and data plane;
- state scale assumptions;
- calculate request, event, storage, and bandwidth orders;
- identify authority and partition keys;
- define consistency;
- trace normal and failure paths;
- protect hot paths;
- define SLOs;
- plan recovery;
- state evolution triggers;
- acknowledge cost and uncertainty.
