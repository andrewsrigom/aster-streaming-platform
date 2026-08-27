# Roadmap

The roadmap is phase-gated. A phase is complete only when its specification, tests, evidence, documentation, and operational requirements pass.

The phase order is also the engineering demonstration path. [`docs/00-start-here/ENGINEERING_DEMONSTRATION.md`](docs/00-start-here/ENGINEERING_DEMONSTRATION.md) maps each required subject to implementation, adverse tests, measurements, operations, and progressive Docker-based checkpoints. Convenient demo startup does not remove or reorder those acceptance obligations.

| Phase | Outcome | Status |
|---|---|---|
| 00 | Repository foundation and execution harness | Released |
| 01 | Local platform and production-ready service skeleton | Released |
| 02 | Identity, accounts, and viewer profiles | Released |
| 03 | Catalog and rights-aware content model | Released |
| 04 | Apollo Federation supergraph | Verified locally; protected release in progress |
| 05 | Next.js shell, SSR, and hydration | Planned |
| 06 | Media ingest, transcode, package, and publish | Planned |
| 07 | Playback sessions and accessible player | Planned |
| 08 | Progress, history, watchlist, and continue-watching | Planned |
| 09 | Home rails, search, and discovery | Planned |
| 10 | Advanced Redis caching and concurrency controls | Planned |
| 11 | Resilience policies and failure laboratory | Planned |
| 12 | Observability, SLI/SLOs, and operational dashboards | Planned |
| 13 | GraphQL performance and abuse resistance | Planned |
| 14 | Capacity validation, release, and hosted operation | Planned |

Optional extensions begin only after Phase 14:

- recommendations;
- scheduled live channels;
- subscriptions and entitlements.

Detailed requirements are under `docs/specs/`. [Phase 03 release](evidence/phase-03/release.txt), [Phase 04 acceptance](evidence/phase-04/README.md) and [current state](.ai/CURRENT_STATE.md) provide the evidence and exact next action.
