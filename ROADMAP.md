# Roadmap

The roadmap is phase-gated. A phase is complete only when its specification, tests, evidence, documentation, and operational requirements pass.

The phase order is also the engineering demonstration path. [`docs/00-start-here/ENGINEERING_DEMONSTRATION.md`](docs/00-start-here/ENGINEERING_DEMONSTRATION.md) maps each required subject to implementation, adverse tests, measurements, operations, and progressive Docker-based checkpoints. Convenient demo startup does not remove or reorder those acceptance obligations.

| Phase | Outcome | Status |
|---|---|---|
| 00 | Repository foundation and execution harness | Released |
| 01 | Local platform and production-ready service skeleton | Released |
| 02 | Identity, accounts, and viewer profiles | Released |
| 03 | Catalog and rights-aware content model | Released |
| 04 | Apollo Federation supergraph | Released |
| 05 | Next.js shell, SSR, and hydration | Released |
| 06 | Media ingest, transcode, package, and publish | Released |
| 07 | Playback sessions and accessible player | Released |
| 08 | Progress, history, watchlist, and continue-watching | Released |
| 09 | Home rails, search, and discovery | Released |
| 10 | Advanced Redis caching and concurrency controls | Released |
| 11 | Resilience policies and failure laboratory | Released |
| 12 | Observability, SLI/SLOs, and operational dashboards | Released |
| 13 | GraphQL performance and abuse resistance | Released |
| 14 | Reference quality now; capacity and hosted operation when explicitly activated | Active — reference track |

Phase14's immediate outcome is a public source reference that is navigable,
reproducible and verifiable locally. Its P14-R13–R18 track improves reading
paths, names, flow, comments, examples and fresh-checkout acceptance without
requiring a public endpoint. Existing P14-R01–R12 capacity, provider, security,
backup and hosted-release obligations remain planned and deferred; they are not
satisfied by local Docker evidence.

Optional product extensions begin only after the hosted Phase14 track is
explicitly activated and released:

- recommendations;
- scheduled live channels;
- subscriptions and entitlements.

Detailed requirements are under `docs/specs/`. [Phase13 release](evidence/phase-13/release.md), [ADR-0048](docs/adr/0048-reference-first-phase-14-runway.md) and [current state](.ai/CURRENT_STATE.md) provide the exact release evidence and next action. Hosted release remains a distinct Phase14 track and is not the immediate objective.
