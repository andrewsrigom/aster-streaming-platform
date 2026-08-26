# Phase 07 — Playback Sessions and Player

## Objective

Deliver an accessible adaptive player whose control-plane authorization and telemetry are independent of media-byte delivery.

## Product traceability

- Primary: `PBK-R01`, `PBK-R02`, `PBK-R03`, `PBK-R04`, `PBK-R05`, `PBK-R06`.
- Supports: `MED-R06`, `OPS-R03`, `QLT-R01`, `QLT-R02`, `QLT-R03`, `QLT-R04`.

## Prerequisites

- Phase 06 has at least one validated published title.
- Phase 05 web shell is verified.

## Deliverables

- Playback subgraph
- short-lived playback sessions
- publication projection and validation
- HLS player adapter
- accessible custom controls
- quality and caption selection
- playback experience telemetry
- error classification and recovery UI
- Docker-only playable demo from empty local state

## Requirements

### P07-R01

Create a playback session only after a bounded owner-authoritative Catalog check confirms that the title and publication are currently playable. Catalog timeout or unavailability fails closed.
### P07-R02

Use a short expiry and auditable session identity without exposing object-storage credentials.
### P07-R03

Return a CDN-compatible manifest reference; GraphQL and Node services must not proxy segments.
### P07-R04

Implement an HLS adapter over the HTML media element with automatic bitrate selection and supported native fallback.
### P07-R05

Implement keyboard-accessible play, pause, seek, mute, volume, rate, fullscreen, captions, and quality controls.
### P07-R06

Persist local player preferences in a hydration-safe, privacy-conscious way.
### P07-R07

Classify session, manifest, network, decode, unsupported-media, caption, and fatal playback failures.
### P07-R08

Measure session success, manifest load, first frame, rendition switch, rebuffer, fatal error, and completion.
### P07-R09

Keep optional Identity, Engagement, and Discovery failure out of anonymous published playback when product policy allows.
### P07-R10

Test expiry, retired publication, missing object, slow network, rendition switch, caption selection, and keyboard behavior.
### P07-R11

Select the smallest player-control strategy through HLS.js and React compatibility, server-rendering boundaries, captions and quality support, keyboard and screen-reader behavior, browser coverage, bundle impact, maintenance, customization ownership, and license evidence. Evaluate Media Chrome as the preferred candidate; Aster retains responsibility for HLS lifecycle, error classification, telemetry, and accessibility acceptance.
### P07-R12

Provide one documented Docker-only command that starts from empty project-scoped volumes, runs required initialization, waits for readiness, and exposes a seeded playable HLS journey without hosted credentials or manual data preparation. Record explicit status, diagnostics, and cleanup commands.

## Invariants

- Only validated active publications receive new sessions.
- Media bytes bypass application services.
- Playback telemetry does not include raw tokens or signed URLs.
- Player controls remain usable by keyboard.
- Optional personalization cannot block playback.

## Implementation sequence

1. Model playback session and publication projection.
2. Create Playback subgraph.
3. Integrate the bounded current-publication check and delivery URL policy.
4. Build player adapter.
5. Build accessible controls.
6. Add telemetry and progress-reporting port without durable progress behavior yet.
7. Exercise network and media failures.
8. Document browser support.

## Required tests

- Session creation for published, retired, missing, and disputed titles.
- Catalog timeout, unavailability, and stale local publication projection.
- Session expiry.
- Manifest and segment delivery path inspection.
- Keyboard and screen-reader control labels.
- Network throttling and rendition adaptation.
- Missing caption or segment behavior.
- Telemetry redaction.
- Player-control compatibility and accessibility tests against the selected supported browser matrix.
- Clean-start Docker-only playback journey with no pre-existing image, volume, identity, or media state.

## Required evidence

Store the phase evidence index under `evidence/phase-07/` when implementation begins.

- playback-session trace
- network waterfall proving CDN path
- first-frame metric sample
- player accessibility report
- failure matrix
- supported browser/device table
- player-control decision record
- Docker-only startup, readiness, playback, diagnostics, cleanup, and local resource-use record

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Durable progress
- Watchlist
- Offline download
- DRM
- Native application players

## Exit gate

The phase is `VERIFIED` only when:

- every requirement has a linked implementation or documented non-applicability;
- all required tests pass from a clean environment;
- evidence is stored and reviewed;
- security, accessibility, failure, and operational effects are documented;
- no planned behavior is described as implemented;
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md` are current;
- the next phase prerequisites are explicitly checked.

## Learning outcomes

- Control plane versus data plane
- HLS.js and media element behavior
- Accessible player design
- Playback quality-of-experience telemetry

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
