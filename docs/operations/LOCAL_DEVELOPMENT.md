# Local Development

## Current status

Phases 00–03 are released. Phase 04 adds an implemented local Apollo Router, private Identity/Catalog subgraphs, per-owner transport credentials and optional correlated traces. The core retains persistent PostgreSQL, disposable Redis and bounded resources. [Current state](../../.ai/CURRENT_STATE.md) records acceptance/release status. Browser UI and playable journeys remain planned.

### Identity reference process

After frozen installation, `pnpm identity:check` builds and runs a self-contained loopback diagnostic with controlled dependency ports, real HTTP and local metrics. It checks not-ready, ready, unavailable and recovered states, then closes its listener and exits naturally. This is not proof of real PostgreSQL/Redis protocol interoperability.

`pnpm identity:start` runs the real adapters using the seven required variables in [Configuration and Environments](CONFIGURATION_AND_ENVIRONMENTS.md). No `.env` file is loaded implicitly. An unavailable database/cache keeps `/health/live` at 200 and `/health/ready` at 503; the bounded monitor owns recovery. Invalid configuration fails before clients/listeners exist. Use `SIGINT`/`SIGTERM` on Linux/WSL to request bounded shutdown. The existing Compose core has no host ports, so it is not automatically reachable by this host-run process. P01-R09 proves networked integration; P01-R10's local runtime checkpoint supplies the Docker-only service command below.

## Current foundation tools

- Node.js `24.19.0`, pinned by `.nvmrc`, `.node-version`, and `package.json`;
- pnpm `11.24.0`, provisioned through Corepack from the integrity-pinned `packageManager` field;
- Git;

## Current local-platform tools

The P01-R01 Docker-only checkpoint supports:

- Docker Engine `26.0.0` or a newer compatible release;
- Docker Compose `2.26.1` or a newer compatible release.

The Phase 00 repository checkpoint still does not require Docker. The following tools remain future checkpoint inputs whose exact operating constraints belong to the phases that first use them:

- FFmpeg and FFprobe compatible with the media recipe;
- enough disk for source and generated media;
- a browser supported by the current test matrix.

## Toolchain validation

### Docker runtime checkpoint

For the browser demo, add the explicit Web/seed overlay:

```bash
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/demo.yml --profile runtime up --build --wait --wait-timeout 120
```

Open <http://127.0.0.1:3000>. This requires no host Node/pnpm/FFmpeg and preserves existing data. The fixed technical seed reuses the checked-in generated-media report; no media bytes are bundled or playable. Web has a 512 MiB/1 CPU/64 PID ceiling and a 32 MiB disposable cache. Its liveness endpoint does not claim upstream readiness. [Docker Web boundaries and recovery](../../apps/web/README.md#docker-only-demo).

For the API-only checkpoint, from the repository root:

```bash
docker compose --project-name aster --file infra/compose/compose.yml --profile runtime up --build --wait --wait-timeout 120
```

Use POST `http://127.0.0.1:4000/graphql`; GET intentionally has no landing page. `docker compose --project-name aster --file infra/compose/compose.yml ps --all` reports Router and owner health. No host Node/pnpm, manual schema initialization or hosted account is needed. Docker builds frozen production packages and waits for owner migrations and the finite trust initializer. Migration jobs hold admin credentials; each API uses its restricted owner/reader login. Successful migrations are not reapplied. Build/pulls precede the 120-second readiness wait; the first build needs registry access.

Router, Identity and Catalog use UID/GID 1000, read-only roots, no Linux capabilities and 384 MiB/1 CPU/64 PID ceilings each. Owner shutdown has a 15-second orchestrator grace; Router has ten seconds around its five-second connection shutdown. Router, optional Web and optional Prometheus join the `edge` bridge; databases and owners stay on the internal `platform` network. Router and Web can use outbound networking through `edge`; no egress firewall is claimed. PostgreSQL helpers override inherited data volumes with tmpfs. The trust initializer has no network, creates two private named volumes, and reuses valid keys on restart. [Router trust and recovery](../../apps/router/README.md#runtime-and-diagnostics).

The seven-variable Identity configuration retains standalone health-only behavior. Normal Compose opts into local Identity with `ASTER_LOCAL_DEMO_ENABLED=true`, `ASTER_PUBLIC_ORIGIN=http://127.0.0.1:4000` and private Router trust; other environments cannot activate it. Owner readiness checks restricted database privileges and required schema. An unavailable dependency produces owner readiness 503 while liveness stays 200 and recovery remains monitored. Router health measures the Router process, not aggregate owner availability: nullable mixed queries can retain one healthy owner. The optional overlay enables metrics and Router traces through the private Collector.

Run the Docker-only product check from POSIX/WSL:

```bash
docker compose --project-name aster --file infra/compose/compose.yml exec -T identity node --input-type=module - --compose-router < tools/verify-local-identity.mjs
```

It uses memory-only credentials and removes only its own synthetic profile. Inspect `identity-init` logs for failed or unknown-version migration state; do not delete retained data to repair startup. Application restart invalidates old local assertions but keeps accounts/profiles. Sign in again. The default account allows five profiles; outbox delivery/cleanup starts in Phase 08, so 128 pending events/account deliberately backpressure further writes. The script also needs free receipt/journal capacity.

Stop all profiles without deleting their named data volumes:

```bash
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/observability.yml --file infra/compose/demo.yml --profile "*" down
```

The earlier core-only command remains light and does not start Identity or create the edge network. Exact source `38801ce` passes the profile commands from a clean checkout with no host Node/pnpm in PATH and no local dependencies or Aster volumes. Full-profile build/start took 36.89 s with warm base/install caches and an uncached application build. Occupied 3100 failed clearly in 4.56 s without stopping its owner; removing only the synthetic conflict allowed the same runtime command to recover in 5.60 s. Normal all-profile stop preserved four data volumes, and the guarded reset removed them. Phase 01 is released through PR 18 with exact post-merge acceptance.

Measured on Linux/WSL amd64 with cached base/dependency layers: image rebuild plus empty-project startup 39.71 s; core-only startup 7.38 s; natural SIGTERM exit 143 in 561 ms including Docker CLI/inspection. A single healthy post-recovery sample reports Identity 51.59 MiB, PostgreSQL 25.11 MiB, Redis 6.004 MiB and status 1.609 MiB; these are observations, not sizing guarantees. Image size is 255272610 bytes; fresh PostgreSQL data is 47488 KiB. See [raw runtime evidence](../../evidence/phase-01/docker-demo.txt).

If localhost fails, inspect `ps --all`, Router/owner logs and port 4000. An internal-only Docker network may report container health without publishing host traffic. For an occupied 4000, stop the conflicting local listener or this stack; never reset Docker or unrelated projects. Earlier Phase 01 measurements above describe its historical Identity-only topology, not current Router startup or sizing. Native Windows/macOS/arm64 execution is not proven.

### Optional profiles

| Selection | Services beyond the four-service core | Published localhost ports |
|---|---|---|
| no profile / core target | none | none |
| `runtime` | Router, Identity, Catalog | 4000 |
| `integration` | Router, Identity, Catalog, Kafka, S3 | 4000 |
| `observability` + overlay | Router, Identity, Catalog, Collector, Prometheus | 4000, 9090 |
| `full` + overlay | Router, Identity, Catalog, Kafka, S3, Collector, Prometheus | 4000, 9090 |

These profiles run finite Identity/Catalog migration jobs and `router-trust-init` before admitting federated API traffic.

```bash
docker compose --project-name aster --file infra/compose/compose.yml --profile integration up --build --wait --wait-timeout 120
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/observability.yml --profile observability up --build --wait --wait-timeout 120
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/observability.yml --profile full up --build --wait --wait-timeout 120
```

Use the overlay with `observability` or `full`; the base file alone does not enable export. Switching to a smaller profile does not stop previously enabled services: use the all-profile `down` command first, which preserves data. Do not supply arbitrary overlays to the local reset.

The optional stack reuses the released integration pins: Apache Kafka 4.3.1, VersityGW 1.7.0, Collector 0.159.0 and Prometheus 3.14.0. Kafka is single-node/plaintext, not a production cluster. S3 is local synthetic storage; its upstream root process has all capabilities dropped. Other optional processes inherit upstream non-root users. Collector/Prometheus configs are baked into digest-pinned images, with no host config mounts.

Open [Prometheus](http://127.0.0.1:9090). Queries include `process_memory_usage_bytes`, `nodejs_eventloop_delay_p99_seconds`, `http_server_request_duration_seconds_count` and `aster_dependency_operation_outcomes_total`. Export interval is 5 seconds, timeout 1 second; scrape interval is 5 seconds. Prometheus limits samples, labels, query concurrency/time and retention to 1 hour/128 MB. Retention is not a hard filesystem quota. No dashboard, tracing/log backend or SLO is claimed.

Local full-profile evidence proves real HTTP/dependency/CPU/memory/event-loop/export metrics, Collector loss with Identity still live/ready, explicit unhealthy telemetry status and recovery. Failed exports reappear under `aster_export_result="failure"` after recovery. Collector-down shutdown completed naturally in 4223 ms including the Docker stop call, exit 143, with degraded telemetry delivery rather than a false flush success.

One post-recovery idle sample (Linux/WSL amd64, health probes active): Identity 41.98 MiB, Kafka 335.8 MiB, S3 9.141 MiB, Collector 19 MiB and Prometheus 30.26 MiB. This is not a capacity test. Raw image IDs, volume sizes, failure observations and guarded nine-container/four-volume cleanup are in [Docker evidence](../../evidence/phase-01/docker-demo.txt).

### Identity image checkpoint

The P01-R10 image builds and runs its existing controlled diagnostic with Docker only, on the verified Linux/WSL amd64 path:

```bash
docker build --file infra/docker/identity.Dockerfile --tag aster-identity:p01-r10 .
docker run --rm --network none --cpus 0.5 --memory 256m --pids-limit 64 --read-only --cap-drop ALL --security-opt no-new-privileges --label com.aster.scope=p01-r10 aster-identity:p01-r10 ./dist/src/check-identity.js
```

The image runs as UID 1000, contains production dependencies and compiled source, and retains upstream notices. The diagnostic checks real loopback health against controlled dependencies and exits naturally; it does not start a database-connected application profile or a playable demo. No port or volume is created. The image/build caches remain; the diagnostic container removes itself. [Image evidence](../../evidence/phase-01/docker-demo.txt) records exact sources, measured size, dependency-lock agreement, isolation and limitations. The runtime command and optional profiles above add real dependencies and metrics, verified by clean-checkout and protected CI evidence. [Current state](../../.ai/CURRENT_STATE.md) owns release status.

### Complete integration matrix

After the pinned repository installation, on Linux/WSL with local Linux Docker containers:

```bash
pnpm integration
```

One fresh six-service project runs eleven scenarios: protocol probes, adapter faults, Identity recovery, held HTTP drain, local Identity GraphQL, sessions, profiles, Kafka, S3, all-adapter HTTP shutdown and telemetry faults. The product scenarios verify migrations, owner isolation, concurrency and session lifetime against real PostgreSQL. The test-only all-adapter composition confirms that HTTP work finishes before consumers stop, telemetry flushes, PostgreSQL/Redis/Kafka/S3 close, and telemetry shuts down within the ten-second budget. Prometheus observes the final HTTP metric. Production Identity does not acquire broker or storage dependencies.

The earlier eight-scenario Phase 01 matrix passed locally in 135.621 seconds plus 5.004 seconds cleanup; this historical warm-image observation is not a startup target or a measurement of the expanded Phase 02 matrix. The fixture removes only its six verified containers, network and four synthetic-data volumes. Images and repository configuration remain. The focused commands below use smaller fixtures. Neither hooks nor ordinary unit tests run this matrix; the existing protected quality job invokes it once, with a 15-minute deadline, for runtime/adapter/Compose and shared bootstrap/dependency changes. Documentation-only and unrelated web changes do not select it.

The following ownership, interruption and Linux/WSL limitations apply to every profile. The Docker-only evaluator path remains P01-R10.

### Real PostgreSQL/Redis integration

After frozen installation, on Linux/WSL with local Linux Docker containers:

```bash
pnpm integration:core
```

The command builds Identity and runs four bounded subprocess scenarios: protocol success/disposal, adapter failure/recovery, real Identity health transitions, and termination during a held diagnostic HTTP request. To repeat only one scenario, append `protocol`, `adapters`, `identity`, or `http-drain`. This explicit laboratory does not run in ordinary unit tests, hooks, or every CI build.

`infra/compose/integration.yml` inherits the reviewed core images and resource limits. The runner generates an `aster-integration-<random>` project, pins the local Docker socket, allocates temporary loopback ports that survive restart, and uses synthetic credentials. It refuses remote endpoints, Docker overrides and pre-existing names. The normal `aster` core dependencies remain unexposed; its runtime profile publishes only Router's loopback GraphQL port.

Stopping/pausing a dependency and final deletion require inspected exact project, fixture, service, environment and scope labels. Cleanup validates all containers, mounts, the network and volume before removing exact IDs. It runs after success, worker failure and handled interruption, then checks for residual resources. Only the disposable synthetic PostgreSQL volume is deleted irreversibly; images are retained. No global prune or default-project reset is used. A parent `SIGKILL` or unavailable daemon can prevent cleanup: retain the printed project ID, inspect its exact ownership, and do not apply the default Aster reset or a broad prefix deletion.

The core slice is implemented with [real integration evidence](../../evidence/phase-01/real-integration.txt). The held handler is test-only, not a product GraphQL endpoint. Native Windows signal semantics remain unsupported by this command; use WSL.

### Real broker and object-storage integration

With the same pinned Linux/WSL toolchain and local Docker:

```bash
pnpm integration:broker
pnpm integration:storage
```

Each command owns a separate disposable project through the same guarded supervisor. The broker laboratory uses digest-pinned Apache Kafka 4.3.1 in single-node KRaft, a synthetic topic/group, keyed delivery, manual offset inspection, cancellation/failure replay, bounded capacity, ambiguous publish outcomes, stop/restart and natural client exit. It uses plaintext on an allocated loopback port; SASL/TLS, distributed failover and product outbox/deduplication are not claimed. The small health CLI has its own JVM budget, independent of the broker heap.

The S3 laboratory uses digest-pinned VersityGW 1.7.0 with a POSIX volume. It checks a missing bucket, bad credentials, empty/small/multipart objects, SHA-256 including multipart composite checksums, streaming read backpressure, read size/cancellation, acknowledged multipart abort cleanup, pause/timeout and persistence across restart. It creates no media title. Administrative SDKs are test-only dependencies, not new Identity runtime dependencies.

Both fixtures use finite CPU/memory/PID/log limits, read-only roots, dropped capabilities, no-new-privileges and no host bind mounts. Kafka runs as the upstream non-root user; the storage fixture runs as root with all capabilities dropped to initialize its fresh owned POSIX volume. Only synthetic data is allowed. Cleanup verifies the exact owned volume before irreversible removal; image caches are retained. The supervisor reports startup/actions/cleanup and one pre-workload resource sample, not a steady-state benchmark. The ownership and interrupted-cleanup rules in the core section apply unchanged.

Broker and S3 protocol scenarios pass individually and in the released combined matrix; exact cold and protected/post-merge gates pass. P01-R10 reuses these pins in its optional local profiles. See [raw integration evidence](../../evidence/phase-01/real-integration.txt).

### Real telemetry integration

```bash
pnpm integration:telemetry
```

This fixed fixture combines PostgreSQL/Redis with digest-pinned core OpenTelemetry Collector 0.159.0 and Prometheus 3.14.0. The test-only Identity composition exports real HTTP, dependency, CPU, memory and event-loop delay metrics through OTLP/HTTP. Prometheus scrapes bounded series; the test verifies HTTP histogram counts, backend/Collector restart, cumulative recovery, stalled-export cancellation and bounded shutdown while the Collector is down. A failed flush is reported as a degraded shutdown, not successful delivery; PostgreSQL, Redis and telemetry still close and the process exits naturally. Optional telemetry failure does not change Identity readiness.

Collector and Prometheus run as their upstream non-root users with read-only roots, finite resource limits and exact read-only `rprivate` config mounts. The Collector's minimal image has no shell health utility: a bounded real OTLP request proves receiver readiness. Prometheus uses its readiness endpoint. Only loopback OTLP/query ports are published; the scrape endpoint stays inside the fixture network. Prometheus uses 1-hour/128 MB retention settings, not a hard filesystem quota or a production sizing result.

Do not edit the two config files while the fixture runs. Docker Desktop/WSL can translate a bind path after restart; cleanup accepts that translation only for the matching distribution and identical file device/inode. Changed files, writable/shared binds or foreign mounts are refused before deletion. Normal teardown removes only the exact synthetic PostgreSQL/Prometheus volumes and fixture containers/network; images and repository config files remain. No host mount propagation, Docker daemon settings or unrelated resources are changed. The core interruption/ownership rules also apply here.

See [raw telemetry evidence](../../evidence/phase-01/real-integration.txt). The released combined matrix proves multi-adapter HTTP drain, with exact cold and protected/post-merge gates passing. The P01-R10 Docker-only profiles above use baked configurations instead of these test-fixture bind mounts.

### Pinned repository bootstrap

After activating the pinned Node.js runtime, provision the repository package manager through Corepack, install from the lockfile, and run the current foundation gate:

```bash
git config --local core.hooksPath .githooks
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm check
```

The Git command activates only this clone's tracked hooks and does not mutate global Git configuration. `pnpm check` uses the pinned local Turborepo binary to run the active-version guard, source-quality checks, architecture checks, and their built-in tests. The guard rejects missing, malformed, prerelease, or non-exact active versions and inconsistent repository pins. It disables Corepack network access while detecting pnpm, so validation cannot silently download a package manager. The first Corepack provisioning and dependency installation require registry access; subsequent offline behavior depends on the local content-addressed cache.

## Source-quality commands

Use check-only commands for ordinary validation:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm unused:check
pnpm architecture:check
pnpm platform:check
pnpm platform:test
pnpm platform:compose:check
pnpm docs:check
pnpm ai:check
pnpm check:changed
pnpm check
```

`pnpm check:changed` is the pre-push candidate gate. It uses the same canonical task list as `pnpm check`, fixes the comparison to `main...HEAD`, and selects tasks through their declared inputs. Global configuration and lockfile changes conservatively select the complete graph. The command requires a resolvable local `main` ref and comparison history; refresh that ref or use the complete gate when the checkout cannot provide them. `pnpm check` remains the complete source and documentation gate; `pnpm check --force` reruns it without Turbo cache. Use `pnpm format:write` only when an intentional formatting rewrite is wanted. The architecture checker scans approved workspace source roots, rejects malformed source and forbidden outward dependencies, and emits structured violations without following symbolic links. Knip checks unused source, exports, and direct dependencies as package source is added.

The standalone `pnpm lint` command first builds the internal telemetry declarations required by the adapter workspaces, then runs type-aware lint across the repository. The complete and affected gates encode the same dependency directly in the task graph and do not repeat that build. This ordering keeps a fresh frozen checkout deterministic without adding repository-wide build work to staged-file linting.

The repository runner invokes `pnpm` directly on POSIX systems and invokes `pnpm.cmd` through a fixed, AutoRun-disabled `cmd.exe` boundary on native Windows. Its task names, flags, and SCM refs are repository-owned; it does not forward arbitrary shell arguments.

The destructive reset remains a POSIX shell script. Its tests run through the Git for Windows shell when invoked natively and normalize Docker/Compose line endings; WSL remains the recommended Windows environment for development and for the destructive reset.

`pnpm docs:check` validates bounded UTF-8 Markdown inputs, first top-level titles, balanced fences, unresolved merge markers, relative files and heading fragments, canonical high-confidence terminology, and evidence support for explicit current-status maturity claims. It does not fetch external URLs, so network reachability remains a separate deliberate audit. `pnpm docs:test` exercises the adverse fixtures directly.

`pnpm ai:check` validates the bounded durable repository-memory files, ordered queue and blockers, active-plan binding, current-state and handoff resume target, and reverse-chronological session shape. `pnpm ai:test` exercises safe malformed, stale, oversized, invalid-UTF-8, and symbolic fixtures. These structural checks do not replace review of narrative truth.

`pnpm platform:check` and `pnpm platform:test` are dependency-free policy gates for immutable images, network isolation, persistence ownership, readiness ordering, resource bounds, and lifecycle behavior. `pnpm platform:compose:check` additionally asks the installed Docker Compose CLI to parse and normalize the actual model; it is intentionally outside the ordinary no-Docker source gate.

Local Git is configured with `core.hooksPath=.githooks`. The `pre-commit` hook reads bounded NUL-delimited staged paths and runs only Prettier and ESLint when their file types apply. The `commit-msg` hook validates the bounded Conventional Commit-shaped subject. Neither hook installs dependencies nor runs repository-wide type checking, Knip, tests, documentation, Turbo, containers, media, or integration suites.

On the measured Phase 00 WSL environment, a documentation-only pre-commit completed in `0.07` seconds, a staged configuration-and-TypeScript check completed in `2.37` seconds, the cold full gate completed in `3.67` seconds, and its cached repeat completed in `0.96` seconds. These observations establish the current feedback tier; they are not portable performance guarantees.

## Command contract

The root README is the copy-paste entrypoint for the currently executable foundation commands. The repository will grow three operational feedback lanes without changing the phase order. Exact application and infrastructure scripts remain planned until their owning work items implement and verify them.

### Development lane

The current development lane uses `pnpm install --frozen-lockfile`, focused checks during edits, `pnpm check:changed` for a coherent candidate, `pnpm check` for the complete acceptance gate, `pnpm audit --audit-level=high`, and `pnpm clean:foundation`. P01-R01 adds canonical PostgreSQL and Redis startup, status, diagnostic, and non-destructive stop commands. P01-R02 adds the separate destructive local reset. Phase 01 also supplies broker, object storage, telemetry, runtime configuration and integration suites. Phase 02 owns the first product migrations and synthetic seed. Later phases add browser, media, failure, and load commands only when they have executable implementations.

The changed-scope gate does not run every integration, browser, media, failure, or load suite on each commit. Each owning phase adds its task inputs and heavyweight acceptance behavior only when the implementation exists.

### Docker-only demo lane

P01-R01 exposes one Compose command for the current runtime-laboratory slice. It requires no host Node.js, pnpm, database, Redis, broker, object storage, telemetry, FFmpeg, or hosted credentials:

```bash
docker compose --project-name aster --file infra/compose/compose.yml up --wait --wait-timeout 120 platform-status
```

The command pulls immutable images when absent, creates the `aster` project, waits for PostgreSQL and Redis health, requires `platform-init` to complete, and leaves `platform-status` healthy. The synthetic `aster-test-only` database credential is fixed, local-only, inaccessible through a published host port, and not accepted as a hosted configuration pattern.

Inspect the ongoing state and bounded initialization output:

```bash
docker compose --project-name aster --file infra/compose/compose.yml ps --all
docker compose --project-name aster --file infra/compose/compose.yml logs --no-color platform-init platform-status
docker compose --project-name aster --file infra/compose/compose.yml exec postgres psql --username=aster --dbname=aster
docker compose --project-name aster --file infra/compose/compose.yml exec redis redis-cli
```

Stop containers and the internal network while preserving PostgreSQL data:

```bash
docker compose --project-name aster --file infra/compose/compose.yml down
```

The explicit project name has higher precedence than an inherited `COMPOSE_PROJECT_NAME`; use it on every public operation so diagnostics and lifecycle commands target the same Aster project. Do not append `--volumes` to the normal stop command.

Delete the current Aster containers, network, disposable Redis state, and durable PostgreSQL volume only with:

```bash
ASTER_ENVIRONMENT=local ./tools/reset-local-platform.sh --confirm DELETE-ASTER-LOCAL-DATA
```

The command accepts exactly the local marker and fixed confirmation. It refuses CI indicators, database or Redis URLs, Docker endpoint/configuration overrides, non-local Docker socket schemes, unexpected services, duplicate resources, partial or mismatched labels, symbolic repository inputs, and any extra argument. Before mutation it pins the inspected local Docker context, the repository Compose file, and project `aster`; it rejects Aster-prefixed physical resources without exact project ownership and validates logical resource, authority, owner, and Compose-file labels. Core service containers may use only the complete current `local|platform` label pair or the complete absent pair created by released P01-R01; Identity and all optional services require the current pair. Project, service and Compose-file labels remain exact. Reset explicitly enables every reviewed profile and checks container mounts/network attachments plus foreign containers sharing project networks or volumes before deletion. Only the exact PostgreSQL, broker, storage and Prometheus volumes, platform/edge networks and nine reviewed services are accepted. Provenance must equal the base Compose file or the ordered base-plus-observability pair; reversed or arbitrary overlays are refused. Legacy helper anonymous volumes require a 64-hex identifier, anonymous/empty labels, no foreign attachment and a post-deletion absence check. It then runs only the scoped all-profile `down --volumes` operation and proves that zero `aster` project resources remain. It never prunes images, containers, networks, or volumes globally and does not use a broad fallback after partial failure.

The reset irreversibly deletes local PostgreSQL/broker/S3 data and disposable Prometheus history. Back up anything you need before confirming. A successful repeat from empty state reports that Aster is already reset without creating resources. Recovery is the normal health-gated startup command, which creates a new empty PostgreSQL volume. Phase-owned migration and seed recovery will be documented when those capabilities exist. Phase 07 expands the Docker-only lane into the first playable HLS checkpoint.

### Laboratory lane

The named profiles above activate broker/storage and telemetry only when required. The full broker, observability stack, media worker, browser suite, failure laboratory, and load tools are not mandatory for ordinary edits.

The destructive local reset remains separate from resource-heavy laboratory commands and accepts no hosted database URL or alternate target.

### Foundation cleanup

`pnpm clean:foundation` is executable now. It accepts no path argument, validates the repository markers, and removes only root `.turbo` and `node_modules`. It is intentionally separate from `reset-local-platform.sh`, which owns the confirmed deletion of current Aster Docker state and local durable data.

## CI and supply-chain commands

Run the complete local decision with:

```bash
pnpm check:changed
pnpm check
pnpm audit --audit-level=high
```

Focused commands are available for diagnosis:

```bash
pnpm check:source
pnpm ai:check
pnpm ai:test
pnpm community:check
pnpm community:test
pnpm security:check
pnpm security:test
pnpm security:staged
pnpm ci:check
pnpm ci:test
```

`community:check` validates the exact bounded UTF-8 contribution, security, issue, chooser, and pull-request contract; its adverse fixtures run through `community:test`. `security:check` scans tracked and non-ignored untracked text without printing matched values. `security:staged` reads bytes from the Git index, so an unstaged working-tree edit cannot hide a staged finding. High-confidence provider patterns, private-key headers, credential-bearing data URLs, and non-placeholder credential assignments fail; binary or invalid-UTF-8 files are skipped and require their owning format-specific scanner later.

The repository-local pre-commit hook runs only the staged secret scan followed by applicable staged formatting and linting. It still does not run Turbo, repository-wide types, tests, documentation, dependency audit, containers, media, or infrastructure.

The configured GitHub governance job runs repository-memory, documentation, public-contribution, secret, CI-policy, and local-platform policy checks plus their tests without installing dependencies. The conditional full path provisions exact pnpm through Corepack, restores only the content-addressed store, performs a frozen install, runs `check:source`, and queries the registry audit endpoint. P01-R01 adds an isolated path-aware `Local platform` job that parses Compose, pulls immutable images, starts the health-gated checkpoint, verifies versions and protocols, and always removes only its unique CI project. Protected run `32947483503` passed the original core execution. P01-R10 adds a Docker-built full-profile check in the same conditional job: in-container non-root health and six real metric families, bounded build/probe steps and all-profile cleanup. Its first hosted run `33046068184` passed all six jobs at `d148bf7`; run `33046678570` also passed all six at `d751109`. Final protected run `33047330768` at `b9f816a` and post-merge run `33047629326` at squash `b0544c9` also pass every applicable gate. [Current state](../../.ai/CURRENT_STATE.md) records subsequent work.

## Local endpoints

The core intentionally publishes no host port. PostgreSQL, Redis, initializer and status communicate only through the internal `platform` network. The optional runtime publishes Identity on `127.0.0.1:3100` and Catalog on `127.0.0.1:3200`, both with `/graphql`, `/health/live` and `/health/ready`. The observability overlay also publishes Prometheus on `127.0.0.1:9090`; PostgreSQL, Redis, broker, storage and Collector have no host ports. [Catalog runtime and scoped verification commands](../../services/catalog/README.md#docker-runtime-and-technical-media) explain its read-only credentials and generated-media tests.

Later phases record ports only when a user-facing or operator-facing endpoint exists. Expected categories include:

- web;
- Apollo Router;
- private subgraph ports;
- object-storage console;
- Grafana;
- trace UI through Grafana;
- log UI through Grafana;
- broker diagnostics.

Do not rely on undocumented ports.

## Progressive data flow for startup

The startup path grows only when its owning phase closes:

1. Phase 01 dependencies become healthy, the reference runtime validates configuration, and readiness passes.
2. Phase 02 migrations and seed create a synthetic local account and profile session without hosted identity.
3. Phase 03 Catalog migrations create its empty durable store; a separate generated-HLS integration command verifies synthetic publication and retirement without populating or approving real films in the retained demo.
4. Phase 04 Apollo Router loads the composed supergraph.
5. Phase 05 the web application renders public catalog routes.
6. Phase 07 the Docker-only checkpoint exposes a seeded playable journey from empty project-scoped state.

Media seed remains separate because source rights and processing can consume significant time and disk.

## Local identity

Phase 02 defines a deterministic local identity method that uses synthetic accounts. It must not require personal accounts or hosted secrets.

## Local media

Phase 06 is in progress. `pnpm media:candidate PROJECT ACQUISITION_ATTEMPT_ID` prepares/reuses an approved HLS candidate; append `--artwork` for the independent JPEG recipe. These commands retain private candidates, not public titles. Reuse for a renewed request requires a checksum in its current approved rights record.

Each new candidate uses run-UUID scratch volume names. After a supervisor interruption, inspect the recorded run with `pnpm media:cleanup PROJECT RUN_UUID`; this is read-only. Add `--apply` only after reviewing its exact targets. Cleanup requires every target to be at least 31 minutes old, matching this project/run, stopped and backed only by the expected disposable tmpfs volumes, without foreign consumers. It never stops a running job or force-removes resources. It can resume after partial cleanup; a completed run is an empty no-op. It does not remove originals, immutable private/public objects, databases, images or audit. Legacy scratch without the run UUID is refused. Never substitute Docker prune or broad project reset. `pnpm media:cleanup:test` verifies a tiny isolated Docker fixture using a controlled test clock, not a film encode. [Scratch recovery evidence](../../evidence/phase-06/scratch.md).

`pnpm media:origin:test` (or `node tools/run-media-origin-integration.mjs`) builds a scoped test image and verifies private incomplete copies, serialized complete-bundle grants, read-only S3 delivery, private/write denial, CORS and Range with synthetic bytes. It removes only its exact labelled fixture containers/tmpfs volume, leaving a reusable build cache. The origin overlay in `infra/compose/media.yml` is opt-in: `media-origin-init` prepares a private bucket, validates existing exact-prefix grants and configures CORS; `media-origin` serves read-only on `127.0.0.1:9001`. It must not replace the private writer or expose originals. The initializer alone never grants public access. The separate [publication workflow](../../services/catalog/MEDIA_PUBLICATION.md) performs immutable copies, whole-bundle verification, a serialized exact-prefix grant and restricted attestation before normal Catalog activation. [Access verification and retained migration](../../evidence/phase-06/publication-access.md).

Do not commit full source films or generated HLS packages to the source repository.

## Troubleshooting sequence

For the implemented P01-R01 checkpoint:

1. run `docker compose --project-name aster --file infra/compose/compose.yml ps --all`;
2. require PostgreSQL, Redis, and `platform-status` to report `healthy` and `platform-init` to report exit code `0`;
3. inspect bounded logs with `docker compose --project-name aster --file infra/compose/compose.yml logs --no-color --tail 200`;
4. validate the static policy with `pnpm platform:check` when Node.js is available;
5. validate the resolved Compose model with `pnpm platform:compose:check` or the equivalent raw Docker command;
6. use the normal `down` command to preserve PostgreSQL state;
7. use `ASTER_ENVIRONMENT=local ./tools/reset-local-platform.sh --confirm DELETE-ASTER-LOCAL-DATA` only when deleting the Aster PostgreSQL volume is intentional;
8. restart through the health-gated public command and verify a new empty local platform after a reset.

For telemetry, inspect the overlay's `platform-status`, Collector logs and Prometheus `up` series; an unhealthy telemetry status helper does not imply Identity is unready. Product migration, router and targeted data recovery remain future work.

## Resource constraints

The P01-R01 limits are:

| Service | CPU limit | Memory limit | PID limit | Retention |
|---|---:|---:|---:|---|
| PostgreSQL | `1.00` | `768 MiB` | `128` | named persistent volume |
| Redis | `0.50` | `256 MiB` | `64` | disposable container state |
| Initializer | `0.25` | `128 MiB` | `32` | one-shot, read-only filesystem |
| Status | `0.25` | `128 MiB` | `32` | read-only filesystem |

On the recorded WSL host, the first local pull completed in `11.79` seconds, clean startup reached health in `9.80` seconds, the PostgreSQL image occupied `302,294,786` bytes, the Redis image occupied `118,619,095` bytes, and the initialized PostgreSQL volume occupied `65.39 MB`. One idle sample observed approximately `37.94 MiB` for PostgreSQL, `6.45 MiB` for Redis, and `1.57 MiB` for status. These values are evidence-scoped observations, not portable requirements.

The optional profiles add Identity 1 CPU/384 MiB/64 PIDs, Kafka 1 CPU/768 MiB/192 PIDs, S3 1 CPU/384 MiB/96 PIDs, Collector 0.5 CPU/128 MiB/64 PIDs and Prometheus 0.5 CPU/256 MiB/64 PIDs. All local service logs rotate at 5 MiB with two files. Media-processing bounds remain Phase 06 work.

Developers with limited resources may start a profile containing only dependencies required by the active phase.

Record the clean-start duration, image and volume footprint, and idle resource use for each verified demonstration checkpoint. Do not state a local resource requirement before measuring it on the named environment.

## Clean-checkout verification

Every closed phase must verify its path from:

- fresh checkout;
- no existing volumes;
- supported tool versions;
- documented environment template;
- no private manual steps.
