# Delivery Specifications

Aster is delivered through fifteen ordered phases. Only one phase is active at a time.

## Phase index

| Phase | Specification | Primary outcome |
|---:|---|---|
| 00 | [`phase-00-foundation.md`](phase-00-foundation.md) | Repository foundation and agent harness |
| 01 | [`phase-01-local-platform.md`](phase-01-local-platform.md) | Reproducible local platform and runtime skeleton |
| 02 | [`phase-02-identity-profiles.md`](phase-02-identity-profiles.md) | Accounts, sessions, and viewer profiles |
| 03 | [`phase-03-catalog-rights.md`](phase-03-catalog-rights.md) | Rights-aware catalog lifecycle |
| 04 | [`phase-04-supergraph.md`](phase-04-supergraph.md) | Apollo Federation supergraph |
| 05 | [`phase-05-web-ssr.md`](phase-05-web-ssr.md) | Server-rendered web shell and hydration |
| 06 | [`phase-06-media-pipeline.md`](phase-06-media-pipeline.md) | Ingest, transcode, validate, and publish |
| 07 | [`phase-07-playback.md`](phase-07-playback.md) | Playback sessions and accessible player |
| 08 | [`phase-08-engagement.md`](phase-08-engagement.md) | Progress, history, watchlist, and resume |
| 09 | [`phase-09-discovery.md`](phase-09-discovery.md) | Home rails and search |
| 10 | [`phase-10-redis.md`](phase-10-redis.md) | Advanced cache and concurrency behavior |
| 11 | [`phase-11-resilience.md`](phase-11-resilience.md) | Failure isolation and controlled degradation |
| 12 | [`phase-12-observability.md`](phase-12-observability.md) | SLIs, SLOs, dashboards, alerts, and traces |
| 13 | [`phase-13-graphql-performance-security.md`](phase-13-graphql-performance-security.md) | Bounded and abuse-resistant GraphQL |
| 14 | [`phase-14-capacity-release.md`](phase-14-capacity-release.md) | Capacity evidence and hosted release |

## Specification contract

Each phase defines:

- objective;
- prerequisites;
- deliverables;
- numbered requirements;
- invariants;
- implementation sequence;
- non-goals;
- required tests;
- required evidence;
- exit gate;
- learning outcomes;
- agent constraints.

## Gate rule

A phase may start only after the previous phase is `VERIFIED` and `CLOSED`.

Exceptions require:

- documented blocker;
- risk assessment;
- explicit update to this index;
- updated dependency graph;
- no false status claims.

## Requirement traceability

Code and tests reference the phase requirement ID that justifies them when the relationship is not obvious from location.

Each phase specification also contains a `Product traceability` section:

- `Primary` means that phase owns final acceptance evidence for the product requirement.
- `Supports` means the phase establishes part of the behavior or a prerequisite, but cannot close the product requirement by itself.
- Every durable product requirement has exactly one primary phase. A supporting phase must not mark the product requirement verified early.

Examples:

```text
P08-R04 — Reject stale playback progress
P10-R06 — Coalesce concurrent cache refreshes
P13-R05 — Enforce operation cost budget
```

## Delivery checkpoints

These checkpoints communicate useful progress without weakening phase gates:

| Checkpoint | Closed phases | Demonstrable outcome |
|---|---|---|
| Repository ready | 00 | Reproducible checks, public contribution workflow, and CI foundation |
| Runtime ready | 01 | Local dependencies and one diagnosable Node.js runtime |
| Browseable product | 05 | Rights-aware catalog exposed through the supergraph and server-rendered web UI using synthetic technical fixtures |
| Playable product | 07 | One rights-approved film processed to HLS and played through the accessible player |
| Core VOD product | 09 | Profiles, browse, playback, progress, watchlist, continue-watching, home rails, and search |
| Hardened release candidate | 13 | Measured cache, resilience, observability, and GraphQL abuse controls |
| Released product | 14 | Hosted, capacity-tested, recoverable, and operationally verified system |

The authoritative mapping from engineering subjects to implementation, adverse tests, measurements, operations, and Docker-based demonstrations is in [`docs/00-start-here/ENGINEERING_DEMONSTRATION.md`](../00-start-here/ENGINEERING_DEMONSTRATION.md). A checkpoint is not accepted when it is visually demonstrable but lacks its phase-owned engineering evidence.

## Evidence layout

When implementation begins:

```text
evidence/
  phase-00/
  phase-01/
  ...
  phase-14/
```

Each phase contains a Markdown index and raw command output, reports, traces, screenshots, query plans, or load-test results as applicable.
