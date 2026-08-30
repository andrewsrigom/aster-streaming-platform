# Browser Playback Telemetry

## Status

The Phase 12 candidate implements local browser playback measurement. Remote
browser telemetry is not implemented: its sample rate is zero, no ingestion
route exists and Aster retains no browser observation on a server. These local
measurements are diagnostics, not a field SLI or capacity claim.

## Ownership and purpose

Web Playback owns the ephemeral recorder. Playback remains the owner of session
authorization and media delivery decisions. The recorder cannot grant access,
change progress, affect readiness or authorize publication.

One recorder is created after the viewer explicitly starts an attempt. It covers
session creation and, after a successful session, the attached media adapter.
The local report answers whether that attempt reached a decoded frame and how
much qualifying rebuffering the adapter observed.

## Measurement definitions

| Measurement | Definition |
|---|---|
| First-frame population | attempts with a successful playback session whose media adapter attaches |
| First-frame success | the first `requestVideoFrameCallback`; where unavailable, advancing media time with decoded current data |
| First-frame excluded | session creation fails, so no media attempt enters the population |
| First-frame failure | fatal media failure after session success and before first-frame success |
| First-frame duration | monotonic time from media-adapter attachment to the first decoded-frame signal |
| Rebuffer start | `waiting` after first frame while the media is neither paused nor seeking |
| Rebuffer end | the following `playing` event or a fatal failure |
| Rebuffer exclusion | waiting before first frame and intervals canceled by pause, seek, disposal or invalid clock data |
| Rebuffer result | finite completed-interval count and total duration for the current attempt |

Session, manifest, rendition, completion and finite failure events remain in the
same journal for diagnosis. Metadata or session success alone does not count as
a decoded frame. A clock failure drops that interval instead of affecting media
behavior or fabricating a duration.

## Sampling and transport

The executable version-one policy is:

| Setting | Value |
|---|---:|
| Local attempt sample rate | `1` (every attempt) |
| Remote attempt sample rate | `0` |
| Maximum journal events | `64` |
| Retention class | `player_attempt` |

Local sampling means in-process measurement only. There is no fetch, beacon,
GraphQL mutation, OpenTelemetry browser exporter, cookie, local-storage entry or
background retry for this data. Developer browser-test attachments are explicit
test artifacts and are not application telemetry.

## Retention and deletion

The recorder retains at most 64 finite events plus its bounded aggregate in the
current JavaScript player instance. Durations and relative timestamps are
clamped from zero through 24 hours; rendition height is capped at 4320. Once the
journal fills, it stops adding events, marks the report truncated and keeps only
bounded aggregate updates.

Starting a new attempt synchronously erases the previous recorder. Unmounting
the player erases it again idempotently. Late callbacks cannot repopulate a
disposed recorder. A generated report is a copy held only in the mounted page
and disappears on retry or unmount. Server retention is zero because no server
receives the data.

## Privacy and cardinality

The fixed report contains policy numbers, one finite first-frame state
(`not_attempted`, `pending`, `succeeded` or `failed`), one
finite failure category, bounded counts/durations and eight event names. It has
no extension map and accepts no arbitrary labels. Account, profile, title,
session, request, trace and publication identifiers are excluded, as are URLs,
manifests, signed media values, cookies, tokens, GraphQL documents and error
messages.

The report is visible only through the explicit **Show local playback
measurements** control. Saved viewing progress is a separate owner-authorized
product feature and does not enter this telemetry record.

## SLI boundary

The local result proves instrumentation behavior and supports a reproducible
demo. It cannot calculate population-level playback first-frame availability,
percentiles or rebuffer ratio. Phase 12 SLI definitions must therefore mark the
central browser source as unavailable while remote sampling is zero; they must
not extrapolate one machine or CI browser into a field objective.

Any future non-zero remote collection requires a separately reviewed change
that defines the trust boundary, body and concurrency limits, abuse controls,
sampling algorithm, transport deadlines, consent/regional handling, storage
owner, raw and aggregate retention, deletion, access control, cost and exporter
failure. Introducing an ingestion service, durable store or changed trust model
requires an ADR. Until those conditions pass, zero remote sampling is the safe
default.

## Verification

Focused recorder and adapter tests cover decoded-frame classification,
pre-frame failure, pause/seek exclusion, fatal rebuffer completion, event flood,
invalid clocks, privacy canaries and disposal. The playable browser journey
proves a real decoded frame and the policy/report shape. Results are indexed in
[Phase 12 evidence](../../evidence/phase-12/README.md).
