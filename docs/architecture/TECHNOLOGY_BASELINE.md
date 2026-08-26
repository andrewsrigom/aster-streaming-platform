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
| Validation | Schema validation at every trust boundary | Explicit runtime safety |
| Durable data | PostgreSQL | Transactions, constraints, ordering, search baseline, recovery |
| SQL access | Typed SQL adapter selected for transparent queries; explicit SQL allowed | Advanced locking, outbox, keyset pagination, and query-plan control |
| Cache | Redis through the official Node client or approved compatible client | Cache, rate limit, atomic scripts, bounded coordination |
| Events | Kafka-compatible broker plus transactional outbox | Durable fan-out and at-least-once semantics |
| Local broker | Redpanda-compatible local runtime | Kafka protocol with practical local setup |
| Media | FFmpeg and FFprobe invoked through argument-safe process spawning | Mature media processing and direct resource control |
| Packaging | HLS VOD | Adaptive browser delivery |
| Browser playback | HTML media element plus hls.js where needed | Native-first playback with broad HLS support |
| Object storage | S3-compatible API; MinIO-compatible local runtime | Portable immutable media origin |
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

The container selection evidence is in [`evidence/phase-01/local-platform-checkpoint.txt`](../../evidence/phase-01/local-platform-checkpoint.txt). Configuration compatibility, dependency, redaction, process-cost, and removal evidence is in [`evidence/phase-01/runtime-configuration.txt`](../../evidence/phase-01/runtime-configuration.txt).

## Decisions deferred to Phase 01

- exact broker, object-storage, and observability container versions;
- concrete typed SQL library;
- concrete Kafka client;
- OpenTelemetry package compatibility;
- service HTTP adapter. Express 5 with the maintained Apollo Server integration is the preferred candidate, but Phase 01 records the decision through an ADR after compatibility and lifecycle tests.

## Decision deferred to Phase 02

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

## Decisions deferred to Phase 14

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
