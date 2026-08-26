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
| Exact source-quality toolchain | Pin TypeScript `6.0.3`, ESLint `10.9.1`, `@eslint/js` `10.0.1`, typescript-eslint `8.68.0`, Prettier `3.9.6`, Knip `6.32.2`, and `@types/node` `24.13.3` | `evidence/phase-00/source-quality-foundation.txt` |
| Architecture-boundary enforcement | Use a bounded repository-owned TypeScript AST scanner with explicit inward-dependency rules and adverse fixtures | `evidence/phase-00/source-quality-foundation.txt` |
| Local commit feedback | Use repository-owned staged-file and commit-message hooks; keep repository-wide and heavyweight gates explicit | `evidence/phase-00/source-quality-foundation.txt` |
| Static documentation validation | Use a bounded dependency-free repository validator for local links, structure, terminology, and evidence-supported current-status claims; do not make network reachability part of the deterministic local gate | `evidence/phase-00/documentation-validation.txt` |
| CI event and aggregation policy | Use pull-request validation, `main` post-merge push, manual dispatch, superseded-run cancellation, path classification, and one stable `CI required` result | `evidence/phase-00/ci-security-foundation.txt` |
| CI action supply chain | Pin checkout `v7.0.1`, setup-node `v7.0.0`, cache `v6.1.0`, and dependency-review `v5.0.0` to reviewed full verified commits | `evidence/phase-00/ci-security-foundation.txt` |
| Secret and dependency review | Use a bounded redacting repository scanner locally and in CI, high-severity pnpm audit after frozen install, and GitHub pull-request dependency/license review; add hosted secret protection during remote governance | `evidence/phase-00/ci-security-foundation.txt` |
| Public contribution surfaces | Use stable Markdown bug, proposal, and pull-request templates plus a blank-issue-disabled chooser; avoid preview issue forms and unverified labels, assignees, or contact channels | `evidence/phase-00/community-governance.txt` |
| Community contract enforcement | Use a bounded dependency-free validator for exact files, front matter, required topics, MIT contribution terms, separate media rights, and safe vulnerability guidance | `evidence/phase-00/community-governance.txt` |
| Public repository governance | Publish the reviewed local history to the authorized public repository; use squash-only protected pull requests, a strict stable aggregate check, read-only Actions defaults, automatic branch cleanup, no routine bypass actors, and supported GitHub security controls | `evidence/phase-00/public-repository-governance.txt` |
| Repository-memory enforcement | Use a dependency-free bounded structural validator for required files, queue and blocker state, active-plan and phase binding, resume targets, and session shape; retain semantic truth and history review as human or agent responsibilities | `evidence/phase-00/ai-state-workflow.txt` |

## Resolved Phase 01 decisions

| Decision | Resolution | Evidence |
|---|---|---|
| Core local container floor | Support Docker Engine `26.0.0` and Compose `2.26.1` as the measured floor; require the model and smoke path to pass on newer compatible releases | `evidence/phase-01/local-platform-checkpoint.txt` |
| Local PostgreSQL runtime | Pin Docker Official Image `postgres:18.6-alpine3.23` by multi-platform digest; persist `/var/lib/postgresql` with version-specific `PGDATA` | `evidence/phase-01/local-platform-checkpoint.txt` |
| Local Redis runtime | Pin Docker Official Image `redis:8.10.0-alpine` by multi-platform digest; select the AGPLv3 option for the unmodified external runtime and keep state disposable | `evidence/phase-01/local-platform-checkpoint.txt` |
| Destructive local reset boundary | Require explicit local intent and confirmation, fixed Aster project and Compose file, local-socket and exact resource-label verification, zero-resource postconditions, and no broad fallback cleanup | `evidence/phase-01/local-reset.txt` |
| Process-start configuration validation | Exact-pin `zod@4.4.3` behind repository-owned types and sanitized errors; read injected environment entries directly, classify every accepted field, and expose no secret value in diagnostics | `evidence/phase-01/runtime-configuration.txt` |
| Structured runtime logging | Exact-pin Pino `10.3.1` behind repository-owned declarations; emit bounded JSON to standard output with reviewed sensitive-key redaction, sanitized errors, and injected validated trace context | `evidence/phase-01/runtime-logging.txt` |
| Service HTTP adapter | Use exact-pinned Express `5.2.1` behind `@aster/http-express`; use Apollo's maintained Express 5 integration at service composition roots and keep framework types out of domain and application layers | `docs/adr/0011-express-http-adapter.md`; `evidence/phase-01/http-adapter.txt` |
| Runtime metrics implementation | Exact-pin the OpenTelemetry API `1.9.1`, core/resources/metrics SDK `2.10.0`, OTLP HTTP metrics exporter `0.221.0`, and Node.js runtime instrumentation `0.34.0` behind repository-owned `@aster/telemetry`; omit host metrics and aggregate SDK packages | `evidence/phase-01/runtime-telemetry.txt` |

## Pending decisions

| Decision | Resolution phase | Required evidence | Safe behavior before resolution | Blocks |
|---|---:|---|---|---|
| Local broker, object-storage, and observability-container versions | 01 | Architecture support, local resource use, health behavior, license, and integration smoke tests | Only the verified PostgreSQL and Redis core checkpoint and process-local telemetry candidate are claimed | Phase 01 verification |
| PostgreSQL, Redis, Kafka, and object-storage client libraries | 01 | Node.js 24 compatibility, deadline and cancellation behavior, close semantics, maintenance, license, security, runtime cost, exit strategy, and focused real-dependency spike | Use only repository-owned ports and the currently released local core | Affected Phase 01 work item |
| Typed SQL library | 02 | First real context-owned schema, transaction, query, migration, generated-type, compatibility, maintenance, and removal evidence | Phase 01 uses its selected PostgreSQL connectivity adapter without product tables or a synthetic query abstraction | Phase 02 persistence implementation |
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

The current Phase 01 preflight narrows the remaining candidates but resolves none of the rows above. It records the archived MinIO upstream, active VersityGW and SeaweedFS alternatives, current Node.js client metadata, and the Kafka shutdown risk in `evidence/phase-01/runtime-runway-preflight.txt`. P01-R06 separately resolves the process-local OpenTelemetry package set in `evidence/phase-01/runtime-telemetry.txt`; Collector/backend images remain pending.

## Repository governance decisions

- Source code and project-authored documentation use the MIT License (`MIT`) with the project notice `Aster contributors`.
- Media assets and third-party materials retain independent licensing terms.
- GitHub is the selected public code host. The repository owner authorized `andrewsrigom/aster-streaming-platform` on 2026-08-25; the public repository was created and audited on 2026-08-26.
- `main` uses the pull-request path, the strict stable `CI required` check, linear squash-merged history, non-fast-forward and deletion protection, and no routine bypass actor.
- External approval is not required while there is only one eligible maintainer; review-thread resolution remains required.
