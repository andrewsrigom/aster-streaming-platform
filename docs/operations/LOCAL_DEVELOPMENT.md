# Local Development

## Current status

The Docker-only infrastructure checkpoint uses exact PostgreSQL and Redis images, health-gated initialization, ongoing status, explicit Aster project selection, bounded resources, persistent PostgreSQL state, disposable Redis state, an internal network, and no host ports. [P01-R02 evidence](../../evidence/phase-01/local-reset.txt) covers scoped reset and preservation behavior. Released P01-R08 adds an executable Node Identity reference process and loopback health diagnostic, separately from Compose. P01-R09 adds the explicit real integration laboratory below. No product schema, broker/object-store runtime, telemetry backend, or playable journey exists yet.

### Identity reference process

After frozen installation, `pnpm identity:check` builds and runs a self-contained loopback diagnostic with controlled dependency ports, real HTTP and local metrics. It checks not-ready, ready, unavailable and recovered states, then closes its listener and exits naturally. This is not proof of real PostgreSQL/Redis protocol interoperability.

`pnpm identity:start` runs the real adapters using the seven required variables in [Configuration and Environments](CONFIGURATION_AND_ENVIRONMENTS.md). No `.env` file is loaded implicitly. An unavailable database/cache keeps `/health/live` at 200 and `/health/ready` at 503; the bounded monitor owns recovery. Invalid configuration fails before clients/listeners exist. Use `SIGINT`/`SIGTERM` on Linux/WSL to request bounded shutdown. The existing Compose core has no host ports, so it is not automatically reachable by this host-run process. P01-R09 proves networked integration; P01-R10 supplies the Docker-only service command.

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

### Real PostgreSQL/Redis integration

After frozen installation, on Linux/WSL with local Linux Docker containers:

```bash
pnpm integration:core
```

The command builds Identity and runs four bounded subprocess scenarios: protocol success/disposal, adapter failure/recovery, real Identity health transitions, and termination during a held diagnostic HTTP request. To repeat only one scenario, append `protocol`, `adapters`, `identity`, or `http-drain`. This explicit laboratory does not run in ordinary unit tests, hooks, or every CI build.

`infra/compose/integration.yml` inherits the reviewed core images and resource limits. The runner generates an `aster-integration-<random>` project, pins the local Docker socket, allocates temporary loopback ports that survive restart, and uses synthetic credentials. It refuses remote endpoints, Docker overrides and pre-existing names. The normal `aster` project remains unexposed and unchanged.

Stopping/pausing a dependency and final deletion require inspected exact project, fixture, service, environment and scope labels. Cleanup validates all containers, mounts, the network and volume before removing exact IDs. It runs after success, worker failure and handled interruption, then checks for residual resources. Only the disposable synthetic PostgreSQL volume is deleted irreversibly; images are retained. No global prune or default-project reset is used. A parent `SIGKILL` or unavailable daemon can prevent cleanup: retain the printed project ID, inspect its exact ownership, and do not apply the default Aster reset or a broad prefix deletion.

The core slice is implemented with [real integration evidence](../../evidence/phase-01/real-integration.txt); the complete P01-R09 broker/S3/Collector/Prometheus matrix and P01-R10 Docker-only application profile remain pending. The held handler is test-only, not a product GraphQL endpoint. Native Windows signal semantics remain unsupported by this command; use WSL.

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

The current development lane uses `pnpm install --frozen-lockfile`, focused checks during edits, `pnpm check:changed` for a coherent candidate, `pnpm check` for the complete acceptance gate, `pnpm audit --audit-level=high`, and `pnpm clean:foundation`. P01-R01 adds canonical PostgreSQL and Redis startup, status, diagnostic, and non-destructive stop commands. P01-R02 adds the separate destructive local reset. Later Phase 01 work adds broker, object storage, telemetry, runtime configuration, migrations, seed data, and integration suites. Later phases add browser, media, failure, and load commands only when they have executable implementations.

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

The command accepts exactly the local marker and fixed confirmation. It refuses CI indicators, database or Redis URLs, Docker endpoint/configuration overrides, non-local Docker socket schemes, unexpected services, duplicate resources, partial or mismatched labels, symbolic repository inputs, and any extra argument. Before mutation it pins the inspected local Docker context, the repository Compose file, and project `aster`; it rejects Aster-prefixed physical resources without exact project ownership and validates logical resource, authority, owner, and Compose-file labels. Service containers may use only the complete current `local|platform` label pair or the complete absent pair created by released P01-R01; project, service, and Compose-file labels remain exact in both cases. It then runs only the scoped `down --volumes` operation and proves that zero `aster` project resources remain. It never prunes images, containers, networks, or volumes globally and does not use a broad fallback after partial failure.

The reset is irreversible for the current local PostgreSQL data. A successful repeat from empty state reports that Aster is already reset without creating resources. Recovery is the normal health-gated startup command, which creates a new empty PostgreSQL volume. Phase-owned migration and seed recovery will be documented when those capabilities exist. Phase 07 expands the Docker-only lane into the first playable HLS checkpoint.

### Laboratory lane

Named Compose profiles or targeted one-shot commands will activate resource-heavy dependencies and experiments only when the active phase needs them. The full broker, observability stack, media worker, browser suite, failure laboratory, and load tools are not mandatory for ordinary edits.

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

The configured GitHub governance job runs repository-memory, documentation, public-contribution, secret, CI-policy, and local-platform policy checks plus their tests without installing dependencies. The conditional full path provisions exact pnpm through Corepack, restores only the content-addressed store, performs a frozen install, runs `check:source`, and queries the registry audit endpoint. P01-R01 adds an isolated path-aware `Local platform` job that parses Compose, pulls immutable images, starts the health-gated checkpoint, verifies versions and protocols, and always removes only its unique CI project. Protected run `32947483503` passed the first hosted execution.

## Local endpoints

P01-R01 intentionally publishes no host port. PostgreSQL, Redis, the initializer, and status communicate only through the internal `platform` network. Use `docker compose exec` and `docker compose ps` rather than relying on a host port.

Later phases record ports only when a user-facing or operator-facing endpoint exists. Expected categories include:

- web;
- Apollo Router;
- private subgraph ports;
- object-storage console;
- Grafana;
- Prometheus;
- trace UI through Grafana;
- log UI through Grafana;
- broker diagnostics.

Do not rely on undocumented ports.

## Progressive data flow for startup

The startup path grows only when its owning phase closes:

1. Phase 01 dependencies become healthy, the reference runtime validates configuration, and readiness passes.
2. Phase 02 migrations and seed create a synthetic local account and profile session without hosted identity.
3. Phase 03 Catalog migrations and seed create synthetic rights-shaped metadata and a small valid HLS fixture.
4. Phase 04 Apollo Router loads the composed supergraph.
5. Phase 05 the web application renders public catalog routes.
6. Phase 07 the Docker-only checkpoint exposes a seeded playable journey from empty project-scoped state.

Media seed remains separate because source rights and processing can consume significant time and disk.

## Local identity

Phase 02 defines a deterministic local identity method that uses synthetic accounts. It must not require personal accounts or hosted secrets.

## Local media

Phase 06 provides:

- a command to review candidate source status;
- a command to process an approved title;
- a small technical fixture for fast tests;
- an optional full-film processing command;
- disk estimates and cleanup.

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

Migration, router, telemetry, and targeted volume-recovery diagnostics become executable only in their owning work items.

## Resource constraints

The P01-R01 limits are:

| Service | CPU limit | Memory limit | PID limit | Retention |
|---|---:|---:|---:|---|
| PostgreSQL | `1.00` | `768 MiB` | `128` | named persistent volume |
| Redis | `0.50` | `256 MiB` | `64` | disposable container state |
| Initializer | `0.25` | `128 MiB` | `32` | one-shot, read-only filesystem |
| Status | `0.25` | `128 MiB` | `32` | read-only filesystem |

On the recorded WSL host, the first local pull completed in `11.79` seconds, clean startup reached health in `9.80` seconds, the PostgreSQL image occupied `302,294,786` bytes, the Redis image occupied `118,619,095` bytes, and the initialized PostgreSQL volume occupied `65.39 MB`. One idle sample observed approximately `37.94 MiB` for PostgreSQL, `6.45 MiB` for Redis, and `1.57 MiB` for status. These values are evidence-scoped observations, not portable requirements.

Media processing concurrency, observability retention, broker resources, and their cleanup remain planned.

Developers with limited resources may start a profile containing only dependencies required by the active phase.

Record the clean-start duration, image and volume footprint, and idle resource use for each verified demonstration checkpoint. Do not state a local resource requirement before measuring it on the named environment.

## Clean-checkout verification

Every closed phase must verify its path from:

- fresh checkout;
- no existing volumes;
- supported tool versions;
- documented environment template;
- no private manual steps.
