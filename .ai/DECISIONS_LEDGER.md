# Decisions Ledger

This ledger is a navigation aid. ADRs remain the authoritative decision records.

Phase 02 identity/session selection is accepted in [ADR-0013](../docs/adr/0013-local-identity-and-sessions.md): guarded local ES256 assertions with durable owner-validated sessions. The assertion adapter is locally verified; account/session persistence passes real database tests. Cookie/GraphQL transport and hosted identity remain separate acceptance boundaries.

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
| Use Express 5 behind a bounded HTTP adapter | `docs/adr/0011-express-http-adapter.md` | Accepted |
| Recognize MITNFA in dependency license review | `docs/adr/0012-mitnfa-dependency-license.md` | Accepted |

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
| Identity image packaging | Pin official Node `24.19.0-bookworm-slim` by multi-platform index; compile in Docker, deploy production dependencies with existing pnpm `--legacy`, run as UID 1000 and retain upstream notices. Source-only context and package file allowlists preserve isolation; actual proof is amd64 only | `evidence/phase-01/docker-demo.txt` |
| Runtime Docker publication | Keep databases on the internal platform network; attach only Identity to a labelled edge bridge and publish loopback 3100. Docker 26 did not publish ports on an internal-only network. Helpers override inherited PostgreSQL image volumes with tmpfs; reset validates legacy anonymous owners before cleanup | `evidence/phase-01/docker-demo.txt` |
| Separate local database password | Add classified optional `ASTER_DATABASE_PASSWORD`, reject competing URL/query password sources and preserve seven-variable callers. Bound the encoded effective URL and never emit the secret; no scanner exception or hidden pg variable | `docs/operations/CONFIGURATION_AND_ENVIRONMENTS.md`, `evidence/phase-01/docker-demo.txt` |
| Local PostgreSQL runtime | Pin Docker Official Image `postgres:18.6-alpine3.23` by multi-platform digest; persist `/var/lib/postgresql` with version-specific `PGDATA` | `evidence/phase-01/local-platform-checkpoint.txt` |
| Local Redis runtime | Pin Docker Official Image `redis:8.10.0-alpine` by multi-platform digest; select the AGPLv3 option for the unmodified external runtime and keep state disposable | `evidence/phase-01/local-platform-checkpoint.txt` |
| Destructive local reset boundary | Require explicit local intent and confirmation, fixed Aster project and Compose file, local-socket and exact resource-label verification, zero-resource postconditions, and no broad fallback cleanup | `evidence/phase-01/local-reset.txt` |
| Process-start configuration validation | Exact-pin `zod@4.4.3` behind repository-owned types and sanitized errors; read injected environment entries directly, classify every accepted field, and expose no secret value in diagnostics | `evidence/phase-01/runtime-configuration.txt` |
| Structured runtime logging | Exact-pin Pino `10.3.1` behind repository-owned declarations; emit bounded JSON to standard output with reviewed sensitive-key redaction, sanitized errors, and injected validated trace context | `evidence/phase-01/runtime-logging.txt` |
| Service HTTP adapter | Use exact-pinned Express `5.2.1` behind `@aster/http-express`; use Apollo's maintained Express 5 integration at service composition roots and keep framework types out of domain and application layers | `docs/adr/0011-express-http-adapter.md`; `evidence/phase-01/http-adapter.txt` |
| Runtime metrics implementation | Exact-pin the OpenTelemetry API `1.9.1`, core/resources/metrics SDK `2.10.0`, OTLP HTTP metrics exporter `0.221.0`, and Node.js runtime instrumentation `0.34.0` behind repository-owned `@aster/telemetry`; omit host metrics and aggregate SDK packages | `evidence/phase-01/runtime-telemetry.txt` |
| Runtime clock and identifier primitives | Use Node.js `Date` and `crypto.randomUUID` behind repository-owned interfaces; provide fixed-clock and finite unique-sequence generators for deterministic tests without a new dependency or global mutation | `evidence/phase-01/platform-adapters.txt` |
| PostgreSQL connectivity client | Exact-pin `pg@8.23.0` behind `@aster/postgres`; bound adapter capacity and every deadline, destroy clients after abort/timeout or unknown protocol state, expose only repository-owned contracts, and defer schema/query tooling and real-container proof | `evidence/phase-01/platform-adapters.txt` |
| Redis connectivity client | Exact-pin `@redis/client@6.2.1` behind `@aster/redis`; disable offline queueing, cap commands and reconnect, destroy ambiguous generations after abort/timeout, expose no generic command or cache policy, and keep Redis non-authoritative | `evidence/phase-01/platform-adapters.txt` |
| S3-compatible object-storage client | Exact-pin `@aws-sdk/client-s3@3.1118.0`, `@aws-sdk/lib-storage@3.1118.0`, and `@smithy/node-http-handler@4.11.3` behind `@aster/object-storage-s3`; disable SDK retries, bound stream size/multipart buffering and deadlines, retire ambiguous generations after cancellation, and defer real interoperability and publication policy | `evidence/phase-01/platform-adapters.txt` |
| Kafka-compatible broker client | Exact-pin provisional `kafkajs@2.2.4` behind `@aster/broker-kafka`; bound retries, bytes, capacity, deadlines and logging, use finite idempotent keyed publish, commit offsets only after successful handling, and require P01-R09 real-broker confirmation or replacement | `evidence/phase-01/platform-adapters.txt` |
| MITNFA dependency policy | Allow the reviewed SPDX `MITNFA` identifier without exempting packages from license checks; preserve notices and repeat review before modifying or bundling affected code | `docs/adr/0012-mitnfa-dependency-license.md`; `evidence/phase-01/platform-adapters.txt` |
| Local broker/storage integration images | Use upstream Apache Kafka JVM 4.3.1 KRaft (the accepted Apache-2.0 alternative to Redpanda's BSL grant) and Apache-2.0 VersityGW 1.7.0 POSIX, both pinned by multi-architecture index digest; keep fixtures isolated and SDK administration test-only | `evidence/phase-01/real-integration.txt` |
| Local telemetry integration images | Use Apache-2.0 core Collector 0.159.0 and Prometheus 3.14.0 pinned by amd64/arm64 index digest; core includes the required components, so omit contrib. Keep metrics/backend faults optional for Identity and config mounts read-only/private with exact identity checks | `evidence/phase-01/real-integration.txt` |

## Pending decisions

Resolved Phase 02 persistence selection: retain pg 8.23.0, explicit parameterized SQL and context-owned row decoding; no ORM or generated-type tool is required for the first schema. Application-held READ COMMITTED transactions lock the account and enforce eight session slots in both policy and SQL. Migration/recovery and runtime privilege boundaries are recorded in [the migration guide](../services/identity/migrations/README.md) and [raw evidence](../evidence/phase-02/account-sessions.txt). Cancellation/uncertain commits retire the connection; writes are not retried automatically.

| Decision | Resolution phase | Required evidence | Safe behavior before resolution | Blocks |
|---|---:|---|---|---|
| Additional observability backends | 12 | A concrete dashboard/trace requirement, bounded resources and verified operation before adding Grafana/Tempo/Loki | Phase 01 finite profiles and Collector/Prometheus are released; no product dashboard or capacity guarantee is claimed | Phase 12 observability |
| Identity/session integration after ADR-0013 | 02 | Durable session revocation, owner-side authorization, CSRF/cookies, clean seed and adverse tests | Local-only assertion adapter; no product endpoint until integration passes | Phase 02 verification |
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

The Phase 01 preflight records the archived MinIO upstream, active VersityGW and SeaweedFS alternatives, client metadata and Kafka shutdown risk in `evidence/phase-01/runtime-runway-preflight.txt`. P01-R06 resolves the process-local OpenTelemetry packages in `evidence/phase-01/runtime-telemetry.txt`; P01-R09 resolves the local Kafka, S3 and Collector/Prometheus images in `evidence/phase-01/real-integration.txt`. P01-R10 records finite profile resources and measured local samples in `evidence/phase-01/docker-demo.txt`; these are not capacity guarantees. Later-phase decisions above remain deferred to their owners.

## Repository governance decisions

- Source code and project-authored documentation use the MIT License (`MIT`) with the project notice `Aster contributors`.
- Media assets and third-party materials retain independent licensing terms.
- GitHub is the selected public code host. The repository owner authorized `andrewsrigom/aster-streaming-platform` on 2026-08-25; the public repository was created and audited on 2026-08-26.
- `main` uses the pull-request path, the strict stable `CI required` check, linear squash-merged history, non-fast-forward and deletion protection, and no routine bypass actor.
- External approval is not required while there is only one eligible maintainer; review-thread resolution remains required.
