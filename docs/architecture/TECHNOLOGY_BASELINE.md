# Technology Baseline

## Purpose

This document distinguishes fixed technology direction from decisions intentionally resolved in the phase that first requires them. Repository metadata is authoritative for exact tool versions; this baseline records resolved selections and the evidence that governs upgrades.

## Fixed direction

| Area | Direction | Reason |
|---|---|---|
| Language | TypeScript with strict settings | Shared language across web, services, workers, and contracts |
| Runtime | Node.js 24 LTS with an exact repository pin | Stable production runtime and tooling |
| Workspace | pnpm `11.24.0` and Turborepo `2.10.12`, both exact-pinned | Reproducible monorepo tasks and dependency boundaries |
| Web | Next.js App Router and React | SSR, server components, routing, and client hydration |
| UI | Tailwind CSS and accessible component primitives | Consistent responsive implementation |
| Remote client state | Apollo Client | Normalized GraphQL cache and SSR integration |
| Local complex state | Redux Toolkit | Explicit player and shell interaction state |
| Graph API | Apollo Federation v2 through Apollo Router | One API with context-owned subgraphs |
| Subgraph runtime | Apollo Server and `@apollo/subgraph` behind a transport adapter | Direct Federation support with replaceable application core |
| Service HTTP adapter | Express 5 behind `@aster/http-express` | Apollo-maintained integration with an explicit replaceable transport boundary |
| Validation | Schema validation at every trust boundary | Explicit runtime safety |
| Durable data | PostgreSQL | Transactions, constraints, ordering, search baseline, recovery |
| SQL access | Typed SQL adapter selected for transparent queries; explicit SQL allowed | Advanced locking, outbox, keyset pagination, and query-plan control |
| Cache | Redis through the official Node client or approved compatible client | Cache, rate limit, atomic scripts, bounded coordination |
| Events | Kafka-compatible broker plus transactional outbox | Durable fan-out and at-least-once semantics |
| Local broker | Apache Kafka 4.3.1 single-node local runtime | Verified Kafka protocol with practical local setup |
| Media | FFmpeg and FFprobe invoked through argument-safe process spawning | Mature media processing and direct resource control |
| Packaging | HLS VOD | Adaptive browser delivery |
| Browser playback | HTML media element plus hls.js where needed | Native-first playback with broad HLS support |
| Object storage | S3-compatible API; evidence-selected local runtime | Portable immutable media origin without assuming an archived implementation |
| Telemetry | OpenTelemetry SDK and Collector | Backend-neutral traces and metrics |
| Local observability | Prometheus, Tempo, Loki, Grafana-compatible stack | Full local diagnosis |
| Unit/integration | Vitest and real dependency containers | Fast domain tests and realistic infrastructure semantics |
| Browser | Playwright | End-to-end, accessibility, and network testing |
| Load | k6 | Scriptable performance and failure validation |
| Logging | Pino-compatible structured logging | Low-overhead JSON logs and redaction |
| API types | GraphQL code generation | Client and operation type safety |

## Decisions resolved in Phase 00

- Source code and project-authored documentation use the MIT License (`MIT`).
- Node.js `24.19.0` is the exact runtime pin. It is an active Krypton LTS release and Node.js 24 remains supported through April 2028.
- pnpm `11.24.0` is the exact package-manager pin. Its published runtime requirement includes Node.js 24, and the package-manager artifact is integrity-pinned in `package.json`.
- Turborepo `2.10.12` is the exact task-runner pin. The selected MIT-licensed npm artifact carries registry signatures and SLSA provenance, runs on the pinned toolchain, and contains the current Windows pnpm execution fix.
- TypeScript `6.0.3`, ESLint `10.9.1`, `@eslint/js` `10.0.1`, typescript-eslint `8.68.0`, Prettier `3.9.6`, Knip `6.32.2`, and `@types/node` `24.13.3` are exact-pinned as the source-quality toolchain. The selected TypeScript and ESLint versions are inside typescript-eslint's published peer ranges, and every package supports Node.js 24.
- Architecture boundaries use a bounded repository-owned TypeScript AST scanner instead of an additional general-purpose boundary framework. This keeps the accepted layer rules explicit, testable, and removable without coupling product packages to the checker.
- Git uses repository-owned `pre-commit` and `commit-msg` hooks. The staged-file hook dispatches only check-only formatting and lint for applicable staged paths; full type, unused-code, architecture, test, documentation, integration, media, and container gates remain explicit commands or CI work.

Node.js native TypeScript execution is limited to repository tooling that uses erasable syntax. Product packages will compile with `tsc`; they do not depend on runtime type stripping as their build strategy. The root tooling project enables `erasableSyntaxOnly` and `verbatimModuleSyntax` so unsupported runtime syntax fails during type checking.

Patch upgrades are deliberate work: update every duplicated pin, verify the official artifact and compatibility, run the toolchain and workspace checks, and replace the affected evidence. The validator intentionally rejects a merely compatible but different runtime or package-manager patch version so local and CI behavior cannot drift silently.

pnpm enforces a 24-hour release-maturity window in strict mode. Because Turborepo `2.10.12` was selected within that window after its Windows fix was reviewed, `pnpm-workspace.yaml` records version-specific exceptions for the signed, integrity-locked Turbo artifacts. Future fresh dependencies fail resolution until mature unless a similarly narrow reviewed exception is committed.

## Decisions resolved in Phase 01

- The P01-R01 supported floor is Docker Engine `26.0.0` with Docker Compose `2.26.1`. Newer releases remain compatible only while the checked Compose model and smoke path pass.
- PostgreSQL uses the Docker Official Image `18.6-alpine3.23` at multi-platform digest `sha256:697c180dbf244d3ce4a8f4cbc0156cde840af055c1bf8b76aebe422a4822086f`. PostgreSQL 18 is supported upstream through November 2030, and the selected patch was current during verification.
- Redis Open Source uses the Docker Official Image `8.10.0-alpine` at multi-platform digest `sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241`. The unmodified local runtime uses the AGPLv3 option from the Redis 8 tri-license and remains separate from MIT-licensed Aster code.
- The core checkpoint publishes no database or cache port, uses an internal Compose network, persists PostgreSQL 18 at its official `/var/lib/postgresql` parent mount, and makes Redis disposable with bounded memory and `allkeys-lfu` eviction.
- Process-start configuration validation uses exact-pinned `zod@4.4.3` behind the repository-owned `@aster/config` API. The selected MIT package has zero runtime dependencies, a published private vulnerability-reporting policy, active Zod 4 releases, registry integrity and signature metadata, and no Zod type in the generated public declarations. The package reads injected environment entries directly and does not add a `.env` loader.
- Structured runtime logging uses exact-pinned Pino `10.3.1` behind the repository-owned `@aster/runtime` API. The selected MIT package supports initialization-time redaction and the pinned Node.js runtime; its resolved production chain is MIT/ISC, the registry audit reports no known vulnerability, and no Pino type appears in generated public declarations. Services emit bounded JSON to standard output; OpenTelemetry SDK and backend selection remain separate owning decisions.
- The service HTTP adapter uses exact-pinned Express `5.2.1` behind `@aster/http-express`. Apollo Server composition uses the Apollo-maintained `@as-integrations/express5` package. The adapter fixes middleware order, bounds JSON, sanitizes asynchronous failures, propagates client cancellation, and has executable Apollo drain compatibility; released P01-R05 owns the complete process lifecycle. [ADR-0011](../adr/0011-express-http-adapter.md) records the Fastify and native HTTP alternatives plus measured revisit triggers.
- Released P01-R06 metrics use exact-pinned `@opentelemetry/api@1.9.1`, `@opentelemetry/core@2.10.0`, `@opentelemetry/resources@2.10.0`, `@opentelemetry/sdk-metrics@2.10.0`, `@opentelemetry/exporter-metrics-otlp-http@0.221.0`, and `@opentelemetry/instrumentation-runtime-node@0.34.0` behind `@aster/telemetry`. The direct and resolved OpenTelemetry packages are Apache-2.0, the selected engine ranges include Node.js `24.19.0`, and generated public declarations expose no SDK or exporter type. The host-metrics, SDK-node, auto-instrumentation, and direct semantic-conventions packages are intentionally absent from this metrics-only slice.
- The P01-R07 clock and identifier checkpoint uses only Node.js `Date` and `crypto.randomUUID` behind `@aster/runtime` interfaces. Fixed-clock and finite unique-sequence generators provide deterministic tests without global mutation or a new package; aggregate-specific identity rules remain deferred to their owning contexts.
- The P01-R07 PostgreSQL connectivity checkpoint exact-pins `pg@8.23.0` and development-only `@types/pg@8.23.1` behind `@aster/postgres`. The adapter bounds capacity and deadlines, destroys a connection after abort, timeout, or unknown protocol state, emits only the released finite dependency telemetry vocabulary, and exposes no vendor type, general SQL seam, schema, migration, repository, or transaction policy. Real PostgreSQL interoperability is verified in the released P01-R09 matrix.
- The P01-R07 Redis connectivity checkpoint exact-pins `@redis/client@6.2.1` behind `@aster/redis`. The adapter disables offline queueing, bounds command capacity and reconnect attempts/delay, replaces a client generation after ambiguous abort/timeout, and exposes only connect, fixed probe, bounded state, and lifecycle behavior. Redis remains non-authoritative; no generic command, cache key, value, TTL, Lua, lease, rate limit, or product policy exists. Real Redis interoperability is verified in the released P01-R09 matrix.
- The P01-R07 S3-compatible object-storage checkpoint exact-pins `@aws-sdk/client-s3@3.1118.0`, `@aws-sdk/lib-storage@3.1118.0`, and `@smithy/node-http-handler@4.11.3` behind `@aster/object-storage-s3`. The adapter disables SDK retries, bounds concurrency, object size, multipart memory, and deadlines, streams exact-length writes and bounded reads, restricts deletion to exact fixture keys, and retires ambiguous client generations after cancellation. It adds no rights, publication, HLS, or CDN policy; real interoperability is verified in the released P01-R09 matrix.
- The resolved AWS graph includes unmodified transitive `bowser@2.14.1`, whose complete distributed terms are classified as `MIT AND MITNFA`. [ADR-0012](../adr/0012-mitnfa-dependency-license.md) adds the SPDX `MITNFA` identifier to hosted review without exempting the package, weakening vulnerability checks, or changing Aster's MIT source license. Modified, forked, or notice-stripping distribution requires a new review.
- The P01-R07 Kafka-compatible broker checkpoint exact-pins provisional `kafkajs@2.2.4` behind `@aster/broker-kafka`. KafkaJS has no runtime dependency and passed the Node.js 24 unavailable-broker lifecycle spike; the actively maintained Confluent alternative installed successfully but its measured lifecycle exceeded the Aster shutdown budget. The adapter bounds retries, capacity, bytes and deadlines, suppresses vendor logging, uses one finite-attempt idempotent keyed producer, commits offsets only after successful handling, and disables automatic consumer crash restart. No product event, outbox, replay, or exactly-once claim exists; P01-R09 verifies real-broker delivery, offsets, failure/replay and restart without adding product event semantics.

The container selection evidence is in [`evidence/phase-01/local-platform-checkpoint.txt`](../../evidence/phase-01/local-platform-checkpoint.txt). Configuration compatibility, dependency, redaction, process-cost, and removal evidence is in [`evidence/phase-01/runtime-configuration.txt`](../../evidence/phase-01/runtime-configuration.txt). Logging compatibility, redaction, correlation, dependency, and process-cost evidence is in [`evidence/phase-01/runtime-logging.txt`](../../evidence/phase-01/runtime-logging.txt). HTTP compatibility, failure, drain, dependency, and process evidence is in [`evidence/phase-01/http-adapter.txt`](../../evidence/phase-01/http-adapter.txt). Telemetry compatibility, contract, failure, dependency, and lifecycle evidence is in [`evidence/phase-01/runtime-telemetry.txt`](../../evidence/phase-01/runtime-telemetry.txt).

## Resolved local integration and demonstration images

P01-R09 selects Apache Kafka 4.3.1, VersityGW 1.7.0, core OpenTelemetry Collector 0.159.0 and Prometheus 3.14.0, pinned by immutable multi-platform digests. The real eight-scenario integration matrix passes locally, in a clean checkout and through protected/post-merge CI. Apache Kafka is the approved Kafka-protocol alternative to the earlier Redpanda candidate; SeaweedFS remains an unselected storage alternative and archived MinIO is not the default.

P01-R10 reuses these images in bounded optional profiles and packages Identity in a pinned non-root Node image. Docker-only clean-checkout and protected CI evidence cover runtime health, metrics, failure recovery, shutdown and scoped reset. See [Runtime Platform Runway](RUNTIME_PLATFORM_RUNWAY.md), [real integration evidence](../../evidence/phase-01/real-integration.txt) and [Docker evidence](../../evidence/phase-01/docker-demo.txt). The [preflight record](../../evidence/phase-01/runtime-runway-preflight.txt) is historical planning, not an unresolved selection.

## Decision deferred to Phase 02

Select the typed SQL library against the first real context-owned schema, transactions, queries, migrations, generated types, and removal path. Phase 01 selects only the PostgreSQL connectivity client and does not create a synthetic product persistence model to justify a query builder.

Identity implementation is selected through an ADR after comparing:

- standards support;
- secure server session behavior;
- JWT/JWKS integration with Router;
- local development;
- account and profile model compatibility;
- hosted operation;
- maintenance;
- lock-in;
- migration path.

The architecture depends on an identity port, not a specific provider in domain code.

## Decisions deferred to the Phase 14 hosted track

- hosted compute;
- managed PostgreSQL;
- managed Redis;
- managed broker;
- object storage and CDN;
- identity hosting;
- telemetry backend;
- secret management;
- deployment controller.
- hosted GraphQL schema registry and supergraph delivery control plane.

## Dependency policy

A new dependency requires:

- problem statement;
- why platform APIs or existing dependency are insufficient;
- maintenance and release activity review;
- license review;
- bundle or runtime cost;
- security posture;
- exit strategy;
- test plan.

Do not select a library because it appears in an example. Verify compatibility against the pinned runtime and adjacent libraries.

## Upgrade policy

- automated proposals are allowed;
- lockfile changes are reviewed;
- major upgrades receive a focused change;
- framework upgrades run schema, browser, performance, and deployment checks;
- media-tool upgrades compare output and playback;
- Router/Federation upgrades recompose and validate known operations;
- security fixes receive risk-based priority without combining unrelated refactoring.
