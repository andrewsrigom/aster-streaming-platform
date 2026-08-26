# Product Requirements

## 1. Product definition

Aster is a VOD service that publishes verified, openly licensed films through an accessible, adaptive streaming experience.

Requirements use stable identifiers. Phase specifications reference these IDs.

## 2. Accounts and profiles

### IDP-R01 — Account access

A viewer can create an account, sign in, sign out, and restore a valid session through the selected identity adapter.

### IDP-R02 — Multiple profiles

An account can own multiple viewer profiles within a configured limit. Each profile has a display name, locale, maturity setting, and optional avatar reference.

### IDP-R03 — Profile isolation

Watchlist, progress, history, and personalization data are isolated by profile. A client cannot access another account's profiles by changing an identifier.

### IDP-R04 — Active profile

The web application establishes one active profile before profile-owned mutations. The active profile is explicit in server requests and verified against the account.

### IDP-R05 — Profile deletion

Deleting a profile removes or anonymizes profile-owned engagement data according to retention policy. Deletion is auditable and safe to retry.

## 3. Catalog and rights

### CAT-R01 — Title lifecycle

A catalog title moves through explicit states:

```text
DRAFT → RIGHTS_REVIEWED → MEDIA_READY → PUBLISHED → RETIRED
```

Invalid transitions are rejected.

### CAT-R02 — Rights requirement

A title cannot reach `RIGHTS_REVIEWED` without a complete rights record. A title cannot reach `PUBLISHED` if rights have expired, are disputed, or conflict with delivery controls.

### CAT-R03 — Metadata

A title includes stable ID, title, synopsis, release year, runtime, genres, languages, credits, artwork, attribution, accessibility metadata, and editorial labels.

### CAT-R04 — Publication atomicity

A published title references one validated media publication. Viewers must not observe a playable title whose active manifest is incomplete.

### CAT-R05 — Public browse

Published titles can be listed and opened without authentication. Non-public titles are visible only to authorized operators.

### CAT-R06 — Attribution

Every title page exposes creator, source, license, license link, and modification notice derived from the rights record.

### CAT-R07 — Retirement

Retired titles disappear from discovery and reject new playback sessions. Existing sessions expire naturally within their short validity window.

## 4. Media processing and delivery

### MED-R01 — Source integrity

The system records source checksum, byte size, media metadata, acquisition source, and acquisition time.

### MED-R02 — Isolated processing

Source files are processed asynchronously in a resource-limited worker. A processing failure cannot make a partial rendition public.

### MED-R03 — Adaptive renditions

The system produces an HLS master playlist with appropriate video renditions, audio, and subtitles based on source capability. It does not upscale source video to invent quality.

### MED-R04 — Technical validation

Before publication, the system verifies manifest references, segment availability, codec support, duration consistency, audio presence, and required caption tracks.

### MED-R05 — Immutable versions

Generated publication versions are immutable. Reprocessing creates a new version and atomically changes the active pointer after validation.

### MED-R06 — CDN delivery

Clients load manifests and segments through CDN-compatible URLs. Application services do not proxy media bytes.

## 5. Playback

### PBK-R01 — Playback session

A viewer can create a short-lived playback session for a published title. The session records title, publication version, profile when present, expiry, and request context needed for audit.

### PBK-R02 — Player behavior

The player supports play, pause, seek, volume, mute, fullscreen, playback rate, captions, keyboard controls, and clear error recovery.

### PBK-R03 — Adaptive playback

The player can use automatic bitrate selection and exposes a controlled quality selection when supported.

### PBK-R04 — Playback availability

Failure of Discovery, watchlist, or history does not block creation of a valid playback session.

### PBK-R05 — Playback telemetry

The platform measures session creation, manifest load, first frame, rebuffering, fatal media errors, rendition changes, and completion with documented sampling and retention.

### PBK-R06 — Accessible captions

Published titles indicate available caption languages. Captions remain usable with keyboard and screen readers.

## 6. Engagement

### ENG-R01 — Progress updates

A profile can report playback position with an idempotency key and monotonic sequence. Duplicate and stale updates do not move progress backward.

### ENG-R02 — Resume rules

A title is resumable when position exceeds the opening threshold and remains below the completion threshold. Thresholds are configuration with tests.

### ENG-R03 — Completion

When the completion threshold is reached, the title is marked completed and removed from continue-watching while remaining in history.

### ENG-R04 — Continue-watching

A profile receives a recent, ordered, bounded list of resumable titles with catalog metadata and saved position.

### ENG-R05 — Watchlist

A profile can add or remove a published title idempotently. Retired titles do not appear in normal watchlist reads.

### ENG-R06 — History

A profile can view recent playback activity under a defined retention and pagination policy.

## 7. Discovery

### DSC-R01 — Home rails

The home experience contains bounded rails such as featured, recently added, genres, and continue-watching when a profile exists.

### DSC-R02 — Search

Viewers can search published titles by normalized title and supported metadata. Results use bounded keyset pagination.

### DSC-R03 — Degraded home

If optional personalized or computed rails fail, the home page returns stable editorial or trending rails and records the degradation.

### DSC-R04 — Cache freshness

Every cached rail defines freshness, staleness allowance, invalidation, and fallback. A stale optional rail must not be presented as real-time.

### DSC-R05 — No empty dependency cascade

One failed rail does not cause unrelated rails to disappear.

## 8. GraphQL platform

### GQL-R01 — Federated ownership

The public API is composed from bounded-context subgraphs with documented entity and field ownership.

### GQL-R02 — Compatibility

Schema changes are additive where possible, checked for composition and known-operation compatibility, and use deprecation before removal.

### GQL-R03 — Authorization

Authorization is enforced by owning application policies for every profile-owned or operator-only operation.

### GQL-R04 — Bounded execution

Requests have body, parser, depth, alias, list, cost, concurrency, rate, and deadline limits.

### GQL-R05 — N+1 control

List and entity paths are batched. Representative operations have recorded query counts and latency.

### GQL-R06 — Trusted operations

Hosted first-party traffic uses a trusted-operation manifest or equivalent persisted-operation control.

## 9. Reliability and operations

### OPS-R01 — Graceful lifecycle

Every Node.js process exposes liveness and readiness, handles termination, drains work within a deadline, and closes dependencies.

### OPS-R02 — Dependency policies

Every outbound dependency has an explicit deadline, retry safety policy, concurrency bound, breaker decision, fallback, and telemetry.

### OPS-R03 — Telemetry

Critical journeys emit correlated logs, metrics, and traces through OpenTelemetry-compatible instrumentation.

### OPS-R04 — Service objectives

Playback start, catalog reads, progress writes, and supergraph availability have documented SLIs and SLOs.

### OPS-R05 — Runbooks

Every actionable production alert links to a tested runbook.

### OPS-R06 — Recovery

Durable stores have backup, restore, and migration recovery procedures verified before release.

## 10. Quality

### QLT-R01 — Functional coverage

Critical domain invariants, authorization, concurrency, schema contracts, media publication, and user journeys have automated tests.

### QLT-R02 — Performance evidence

Performance claims include reproducible workload, environment, raw evidence, interpretation, and limitations.

### QLT-R03 — Accessibility

Core browse and playback journeys meet the documented accessibility checks and manual review.

### QLT-R04 — Security

The release passes documented source, dependency, secret, container, GraphQL abuse, authorization, and media-processing security checks.
