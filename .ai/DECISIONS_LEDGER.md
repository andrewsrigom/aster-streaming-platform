# Decisions Ledger

This ledger is a navigation aid. ADRs remain the authoritative decision records.

[ADR-0037](../docs/adr/0037-rights-safe-catalog-cache.md) limits the first Phase10
cache to Catalog public-title entity projections. Every positive reuse follows a
current PostgreSQL visibility/version fence; browse ordering, rights and Playback
authority remain uncached. Entries, deterministic jitter, process coalescing and
tokenized Redis leases are finite. Fence work shares only within an identical
request-time/policy scope; wrong-type or oversized Redis values are rejected
before value bytes reach the application. Negative envelopes carry cache time;
missing, future or older-than-ten-second values are deleted and rechecked even
when Redis expiry is absent or excessive. Redis loss bypasses to source, and
cache coordination never authorizes durable work. Lease acquisition atomically
replaces only wrong-type or non-expiring malformed keys while preserving finite
holders, and coalescing records monotonic attachments separately from active
cancellation waiters.

[ADR-0036](../docs/adr/0036-independent-home-rails.md) defines fixed-size
independent public rails, explicit freshness/outcomes, stable recent fallback,
curated rather than behavioral trending, and nullable Engagement-owned home
personalization. Four selections execute sequentially so each request reserves at
most one transaction; usable partial responses log as degraded. The genre branch
may federate at most36 Catalog Title references; Catalog splits them into owner
batches of at most20. Fallback applies only to empty/unavailable primary results
and never hides cancelled/indeterminate outcomes. No profile copy, new service,
cache or event is introduced.
PR34 released ADR-0036 through main `a3f969c` and exact-main CI33249289718.
P09-R10 consumes its operations through ADR-0008/0018's public SSR and disposable
private Apollo boundaries. Exact HomePublic/SearchTitles are positively projected
into request-scoped SSR snapshots; HomePersonalized is admitted only by the
owner-confirmed profile client and discarded with its lifecycle. No new
architecture decision is required.

[ADR-0035](../docs/adr/0035-discovery-projection.md) defines current Catalog snapshots, monotonic version/retirement fences,300-second visibility leases,150-second renewal, serviceable active maintenance, broker position-zero promotion, bounded search/rebuild and UUID-selected local exact quarantine replay. Optional Discovery never gates Router startup. No external search engine or cross-owner SQL. P09-R01 is released through main `0bdcb27`. Its finite migration3 compatibility stage accepts only ordered markers1–2 or1–3; the old init preflight tolerates marker3 without owning or applying that script. PR35 released this precursor as main `583c835` and exact-main CI33244657936 passed.

[ADR-0034](../docs/adr/0034-owned-event-delivery.md) defines owner-local fenced relays, unchanged v1 envelopes, dedicated Identity-event authentication and durable deletion/quarantine/replay. Real recovery required a one-second rebalance wait inside the existing broker deadline and an independent outbound step while inbound consumption recovers. Separate background credentials do not widen request roles; candidate/protected release remains.

[ADR-0033](../docs/adr/0033-request-scoped-engagement-fields.md) defines nullable Title/Profile progress and membership, request-only DataLoader 2.2.3 caches, twenty pairs/five profiles, current ownership and lazy Catalog visibility. One owned SQL batch preserves order/missing data; Catalog failure does not gate progress. No migration or new trust transport.

[ADR-0032](../docs/adr/0032-owned-watchlist-visibility.md) defines durable profile watchlist versions/membership, one-hour idempotency, atomic receipt/event and reclaimable 256-entry slots. Reuse ADR-0031's implemented Catalog visibility contract. Watchlist protected and exact post-merge acceptance pass.

[ADR-0031](../docs/adr/0031-current-catalog-visibility.md) corrects ENG-R04 before history release: current Catalog visibility filters continue-watching before pagination, with a purpose-separated twenty-ID private batch, two-second snapshot, independent optional admission and at most thirteen serial calls. History stays durable/nullable; no migration, cache or media change.

[ADR-0030](../docs/adr/0030-local-engagement-progress.md) defines independent current Identity/Playback reads, purpose-separated credentials, bounded snapshot authority and atomic Engagement progress/receipt/outbox. Four GraphQL admissions and a 2.5-second application budget nest under Router; optional saving never gates media. Real owner-connected Docker acceptance passes. Relay, deletion consumer and browser reporting remain later Phase 08 work.

[ADR-0028](../docs/adr/0028-player-controls.md) selects client-only HLS.js/Media Chrome with Aster-owned lifecycle/QoE and native caption/quality selectors. Actual default-caption cue loss and the redundant upstream toggle's invalid ARIA were corrected without suppressing checks. [ADR-0029](../docs/adr/0029-generated-playable-demo.md) adds a separate fixed generated playable title, network-disabled generation, immutable publication through existing Catalog authority and one Docker command. Actual startup, captioned playback, replay, exact cleanup and [protected release](../evidence/phase-07/release.md) pass.

[ADR-0027](../docs/adr/0027-local-playback-sessions.md) defines a private credential-separated Catalog GraphQL read and Playback-owned fifteen-minute sessions capped by current rights. Local persistence has 4096 SQL slots, 24-hour post-expiry audit and at most 64 pruned rows per admission. No shared Router credentials, cross-owner SQL, media proxy or optional personalization dependency. Real connected service/Compose and SQL acceptance pass. Router startup no longer depends on Identity; backend PR 24 is released.

[ADR-0026](../docs/adr/0026-local-media-publication.md) now keeps the access barrier through current-rights/SQL confirmation and compensates rejected new grants to the exact recorded prior policy. Prior grants survive failed replay. Uncertain writes or failed compensation require explicit origin containment and fenced recovery; this is bounded compensation, not distributed atomicity or retroactive CC revocation. No schema, data-owner or retained-media change.

[ADR-0026](../docs/adr/0026-local-media-publication.md) now enforces private incomplete copies and one exact verified-prefix public grant. The pinned POSIX backend lacks object ACL/tag-condition support; use its supported bucket policy, bounded to 100 prefixes, with a conditional-create non-expiring recovery barrier to serialize updates. The known retained bundle was verified/restricted without media/editorial changes. Explicit fencing precedes stale-barrier cleanup; no automatic hosted lock/lifecycle claim.

[ADR-0023](../docs/adr/0023-isolated-media-decoder.md) now gives scratch volumes non-reused run-UUID names and bounded, dry-run-first orphan recovery. Only stopped, expired, exact disposable resources without foreign consumers may be removed, never force. Immutable object-storage content/audit is preserved; storage-prefix garbage collection is not implied.

[ADR-0026](../docs/adr/0026-local-media-publication.md) preserves editorial history and separates current approval, immutable bundle verification, restricted technical registration and normal Catalog activation. Migration 0007 grants only narrow definer-function registration, never editorial writes. The read-only origin joins the existing edge bridge only; internal-only Docker networking did not activate host bindings. Exact loopback URLs remain local-only. Migration 0008 adds transaction-local, append-only activation history and compatible owner replacement/rollback; no direct history-write grant. First-film publication and synthetic rollback pass locally; orphan/browser/release remain open.

[ADR-0025](../docs/adr/0025-derived-artwork.md) adds frame-jpeg-v1 to the same isolated worker and durable Catalog processing owner. It derives bounded no-upscale posters/thumbnails, reuses current-rights/lease guards and keeps the HLS key unchanged. No schema or publication permission changes; image generation/inspection does not itself approve artwork rights.

[ADR-0024](../docs/adr/0024-durable-media-processing.md) adds Catalog-owned processing leases, three attempts per checksum/recipe, current-rights reuse and explicit private-candidate recovery. Additive migration 0006 grants no publication access. The retained real candidate is adopted and replayed without another encode.

[ADR-0023](../docs/adr/0023-isolated-media-decoder.md) defines the finite network-disabled TypeScript decoder, bounded ZIP/probe/HLS policy and Catalog-owned private candidate retention. The real source is 640×359, so the no-upscale ladder uses 240/358 heights. MIT yauzl 3.4.0 and pend 1.2.0 retain notices; separate FFmpeg compliance is unchanged. Private reports do not grant attestation/publication authority.

[ADR-0022](../docs/adr/0022-local-media-execution.md) implements finite Catalog-owned acquisition, bounded streams, fenced durable attempts and private verified originals. One native POSIX action closes the pinned local gateway's conditional-write race. Only acquisition has an egress bridge; the platform remains internal and the decoder will be network-disabled. Technical attestation and hosted origin acceptance remain separate boundaries.

[ADR-0021](../docs/adr/0021-catalog-media-requests.md) retains media requests in Catalog through the existing local operator: exact current rights/source binding, permanent replay IDs, immutable audit and 16 distinct requests/title. No editorial version or publication changes; no new service, broker, worker credential or attestation permission. Attempt execution and checksum-based processing idempotency remain unfinished Phase 06 work.

Phase 06's first actual source is Big Buck Bunny's official 640x360 movie archive. [Current rights review](../evidence/phase-06/rights-review.md) and [Catalog approval](../evidence/phase-06/catalog-approval.json) preserve CC BY 3.0, complete credits and independent caption/artwork conditions under ADR-0010. Approval authorizes exact-source acquisition, not unvalidated publication; Aster stays MIT.

[ADR-0020](../docs/adr/0020-web-transitive-licenses.md) preserves MIT with exact package-scoped license exceptions, locked-version checks and offline Web notice packaging. It retains native-library source/notice obligations and leaves binary-distribution acceptance in Phase 14.

[ADR-0018](../docs/adr/0018-local-web-session-boundary.md) allows only exact local Web/diagnostic origins, keeps owner session authorization unchanged, and separates public Apollo preloads from interaction-only private caches. Redux owns dialog flow only. Web's scoped upstream declaration-file compatibility exception does not disable strict source checks.

[ADR-0017](../docs/adr/0017-local-router-trust.md) selects pinned Apollo Router 2.17.0 Core, per-owner local file credentials and private subgraph ports. Owners still authorize sessions/data. GraphOS-key-protected limits are not enabled; Collector removes native arbitrary operation/document attributes before trace export. Hosted identity and full operation protection remain later-phase decisions.

[ADR-0016](../docs/adr/0016-isolated-generated-media-fixture.md) selects a network-disabled, resource-limited local FFmpeg fixture job. Aster stays MIT; GPL-containing Debian tooling remains a separate executable with notices and a binary-release compliance gate. Synthetic tests do not approve real films or prove CDN/browser delivery.

Phase 02 identity/session selection is accepted in [ADR-0013](../docs/adr/0013-local-identity-and-sessions.md): guarded local ES256 assertions with durable owner-validated sessions. The assertion adapter is locally verified; account/session persistence passes real database tests. Cookie/GraphQL transport and hosted identity remain separate acceptance boundaries.

The owned-profile slice implements defaults of five profiles (configured 1–16), per-session active selection, optimistic versions, 24-hour idempotency receipts (64/account), 30-day audit (128/account), and a non-evicting pending outbox (128/account). Deletion removes preferences immediately; broker delivery/consumer acknowledgment remains Phase 08. These reversible owner policies preserve the accepted architecture; exact contracts and proof are in [migration policies](../services/identity/migrations/README.md) and [profile evidence](../evidence/phase-02/profiles-outbox.txt).

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
| Accept Elastic-2.0 Apollo dependencies and 0BSD tslib while preserving Aster MIT | `docs/adr/0014-apollo-federation-license-policy.md` | Accepted; owner authorization and narrow CI policy implemented |
| Separate local Catalog operators from viewer identity; reserve bounded takedown capacity | `docs/adr/0015-local-catalog-operator.md` | Accepted; local CLI, audit and transaction checks implemented |

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
| Runtime Docker publication | Phase 04 supersedes the historical Identity-only port: Router publishes loopback 4000; owners/databases remain private. The labelled edge bridge is retained because Docker 26 does not publish internal-only network ports. Helpers avoid anonymous volumes; reset accepts exact owned resources only | `docs/adr/0017-local-router-trust.md` |
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

- Phase 05 UI selection is resolved: adapted shadcn Button and Radix Dialog only, with native controls, lazy modal loading and explicit persistent polite/atomic announcements. [Selection](../evidence/phase-05/ui-foundation.md) and [actual reader/bundle evidence](../evidence/phase-05/reader-review.md) cover the decision; player controls remain Phase 07. ADR-0019 also covers unmodified external Orca/Firefox verification without changing MIT or adding a product service.

- [ADR-0019](../docs/adr/0019-accessibility-test-tooling.md): accept unmodified axe Playwright/core 4.13.0 as dev-only MPL-2.0 tooling. Two package-specific CI exceptions plus separate exact-version/lock/dev checks preserve the general license policy and MIT source. No production inclusion or broader MPL exception is authorized by this decision.

- On 2026-08-27 the owner authorized Elastic-2.0 Apollo dependencies (ADR-0014), then authorized autonomous compatible licensing decisions for the public repository, including a necessary project-license adjustment. Retain actual terms/notices and narrow checks; keep MIT absent a demonstrated compatibility need. Do not pause merely for an unfamiliar allowlist entry. Unresolved rights, paid resources, credentials and irreversible data loss remain separate boundaries.
- Source code and project-authored documentation use the MIT License (`MIT`) with the project notice `Aster contributors`.
- Media assets and third-party materials retain independent licensing terms.
- GitHub is the selected public code host. The repository owner authorized `andrewsrigom/aster-streaming-platform` on 2026-08-25; the public repository was created and audited on 2026-08-26.
- `main` uses the pull-request path, the strict stable `CI required` check, linear squash-merged history, non-fast-forward and deletion protection, and no routine bypass actor.
- External approval is not required while there is only one eligible maintainer; review-thread resolution remains required.
