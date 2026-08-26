# Decisions Ledger

This ledger is a navigation aid. ADRs remain the authoritative decision records.

| Decision | ADR | Status |
|---|---|---|
| Use a TypeScript monorepo with explicit application and package boundaries | `docs/adr/0001-monorepo.md` | Accepted |
| Organize product behavior into five bounded contexts | `docs/adr/0002-bounded-contexts.md` | Accepted |
| Expose the application API through Apollo Federation v2 | `docs/adr/0003-federation.md` | Accepted |
| Use PostgreSQL as durable authority and context-owned persistence | `docs/adr/0004-data-ownership.md` | Accepted |
| Keep Redis non-authoritative with explicit degraded behavior | `docs/adr/0005-redis.md` | Accepted |
| Package video as HLS and deliver it through object storage and CDN | `docs/adr/0006-media-delivery.md` | Accepted |
| Publish domain events through transactional outboxes with idempotent consumers | `docs/adr/0007-events.md` | Accepted |
| Separate Apollo remote state from Redux local interaction state | `docs/adr/0008-client-state.md` | Accepted |
| Standardize telemetry through OpenTelemetry | `docs/adr/0009-observability.md` | Accepted |
| Require verified rights records before media publication | `docs/adr/0010-content-rights.md` | Accepted |

## Resolved Phase 00 decisions

| Decision | Resolution | Evidence |
|---|---|---|
| Exact Node.js runtime | Pin Node.js `24.19.0`, an active Krypton LTS release | `evidence/phase-00/toolchain-selection.txt` |
| Exact package manager | Pin pnpm `11.24.0` with its published SHA-512 package integrity | `evidence/phase-00/toolchain-selection.txt` |
| Exact monorepo task runner | Pin Turborepo `2.10.12`; use only locally installed root and package tasks | `evidence/phase-00/workspace-foundation.txt` |

## Pending decisions

| Decision | Resolution phase | Required evidence | Safe behavior before resolution | Blocks |
|---|---:|---|---|---|
| Exact lint, format, and boundary-tool versions | 00 | Compatibility matrix, clean install, maintenance and license review, and representative checks | Node.js, pnpm, and Turborepo are authoritative; code-quality commands remain limited to the toolchain foundation | Remaining Phase 00 verification |
| Local PostgreSQL, Redis, broker, object-storage, and telemetry versions | 01 | Architecture support, local resource use, health behavior, and integration smoke tests | No local dependency stack is claimed | Phase 01 verification |
| Configuration, typed SQL, Kafka, and telemetry adapter libraries | 01 | Compatibility, maintenance, license, security, runtime cost, exit strategy, and focused spike | Depend on domain ports, not an unselected library | Affected Phase 01 work item |
| Service HTTP adapter | 01 | ADR with Apollo integration compatibility, middleware ordering, input limits, async errors, cancellation, graceful shutdown, maintenance, license, and performance evidence | Express 5 is the preferred candidate; no framework type enters domain or application code before the ADR | Phase 01 verification |
| Identity adapter and session model | 02 | ADR comparing standards, local development, hosted operation, security, maintenance, and migration | No product identity behavior is implemented | Phase 02 start |
| Local Apollo Router distribution and schema-delivery workflow | 04 | Supported Federation behavior, reproducible composition, local operation, and upgrade path | Subgraph schemas remain independently testable and private | Phase 04 verification |
| Router-to-subgraph identity-context protection | 04 | Threat model, forgery tests, key handling, local topology, deadline, and rotation path | No public route reaches a subgraph directly; no public identity header is trusted | Phase 04 verification |
| Web UI primitive strategy | 05 | Current Next.js and React compatibility, accessibility, bundle impact, maintenance, customization ownership, license, and used-component inventory | Use semantic HTML and minimal local primitives; shadcn/ui is the preferred candidate | Phase 05 verification |
| Player-control component strategy | 07 | HLS.js and React compatibility, SSR boundary, captions, quality, keyboard and screen-reader behavior, browser coverage, bundle impact, maintenance, customization ownership, and license | Native media controls remain the early technical fallback; Media Chrome is the preferred candidate | Phase 07 verification |
| Hosted compute and deployment controller | 14 | Capacity, operational fit, cost, rollback, and artifact requirements | Local and integration environments only | Hosted release |
| Hosted PostgreSQL provider | 14 | Version support, backup/restore, connection limits, observability, migration, and cost | PostgreSQL-compatible ports and local containers | Hosted release |
| Hosted Redis provider | 14 | Command compatibility, eviction/failover behavior, limits, observability, and cost | Redis remains non-authoritative | Hosted release |
| Hosted event-broker provider | 14 | Kafka compatibility, retention, ordering, replay, limits, observability, and cost | Kafka-compatible contracts and local broker | Hosted release |
| Hosted object storage and CDN provider | 14 | S3/HLS compatibility, CORS, cache behavior, origin protection, egress, rights compatibility, and cost | S3-compatible local storage and CDN-compatible URLs | Hosted release |
| Identity hosting arrangement | 14 | Compatibility with the Phase 02 adapter ADR, secret rotation, availability, operations, and cost | Deterministic local identity only | Hosted release |
| Hosted service identity and key management | 14 | Network trust model, workload identity support, rotation, revocation, audit, and operational recovery | Phase 04 local protection remains environment-scoped and is not claimed as hosted-ready | Hosted release |
| Hosted GraphQL schema registry and supergraph delivery control plane | 14 | Composition checks, schema delivery, access control, audit, availability, rollback, telemetry, vendor lock-in, and cost | CI produces versioned local supergraph artifacts without requiring a managed control plane | Hosted release |
| Hosted telemetry backend and secret management | 14 | OpenTelemetry compatibility, retention, privacy, alerting, rotation, access control, and cost | Local backends and environment-local development secrets | Hosted release |

Pending decisions are resolved only by their owning phase. A work item stops when it needs a pending decision whose required evidence is unavailable; it does not select a dependency implicitly.

## Repository governance decisions

- Source code and project-authored documentation use the MIT License (`MIT`) with the project notice `Aster contributors`.
- Media assets and third-party materials retain independent licensing terms.
- GitHub is the selected public code host. The repository owner authorized the planned public target `andrewsrigom/aster-streaming-platform` on 2026-08-25.
- Remote creation remains planned until the ordered Phase 00 local Git, CI, remote-existence, ruleset, and security checks in `docs/operations/REPOSITORY_GOVERNANCE.md` are ready.
- `main` will use the pull-request path, a stable required aggregate check, linear squash-merged history, and force-push and deletion protection without requiring unavailable external approval from a single maintainer.
