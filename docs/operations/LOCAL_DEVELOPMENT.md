# Local Development

## Current status

The Phase 00 toolchain guard, pnpm workspace, frozen lockfile, and initial Turborepo task graph are implemented and verified. Application, infrastructure, demonstration, and broader quality commands remain a contract for their owning Phase 00 and Phase 01 work items; they are not yet claimed as executable.

## Required tools

- Node.js `24.19.0`, pinned by `.nvmrc`, `.node-version`, and `package.json`;
- pnpm `11.24.0`, provisioned through Corepack from the integrity-pinned `packageManager` field;
- Git;
- container runtime with Compose support;
- FFmpeg and FFprobe compatible with the media recipe;
- enough disk for source and generated media;
- a browser supported by the current test matrix.

## Toolchain validation

After activating the pinned Node.js runtime, provision the repository package manager through Corepack, install from the lockfile, and run the current foundation gate:

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` uses the pinned local Turborepo binary to run the active-version guard and its built-in tests as uncached root tasks. The guard rejects missing, malformed, prerelease, or non-exact active versions and inconsistent repository pins. It disables Corepack network access while detecting pnpm, so validation cannot silently download a package manager. The first Corepack provisioning and dependency installation require registry access; subsequent offline behavior depends on the local content-addressed cache.

## Command contract

The repository will expose three feedback lanes. Except for the foundation install and check above, exact scripts remain planned until their Phase 00 and Phase 01 work items implement and verify them.

### Development lane

```bash
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:migrate
pnpm seed
pnpm dev
```

Additional operational commands:

```bash
pnpm infra:status
pnpm infra:logs
pnpm infra:down
pnpm local:reset
pnpm test:integration
pnpm test:e2e
pnpm test:load:smoke
pnpm docs:check
```

The fast changed-scope gate will not run every integration, browser, media, failure, or load suite on each commit. The final script names and affected-graph behavior are selected in Phase 00.

### Docker-only demo lane

The verified slice will expose one Compose command that requires no host Node.js, pnpm, database, broker, object storage, telemetry, FFmpeg, or hosted credentials. The final command is recorded after the Compose layout and minimum version are verified. It must build or pull pinned images, run one-shot initialization, wait for health, print the useful URL and diagnostics, and support explicit project-scoped cleanup.

### Laboratory lane

Named Compose profiles or targeted one-shot commands will activate resource-heavy dependencies and experiments only when the active phase needs them. The full broker, observability stack, media worker, browser suite, failure laboratory, and load tools are not mandatory for ordinary edits.

`local:reset` must require explicit local-environment confirmation and must never accept a hosted database URL.

## Local endpoints

Phase 01 records the final ports in generated local documentation. Expected categories:

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

1. run `infra:status`;
2. inspect service readiness;
3. validate configuration;
4. check migration state;
5. inspect router composition version;
6. inspect trace and structured logs;
7. inspect dependency health;
8. reset only the affected local volume when safe;
9. use full local reset last.

## Resource constraints

Local infrastructure uses conservative defaults. Media processing concurrency is one unless explicitly raised. Observability retention is short. Broker and database volumes have documented cleanup.

Developers with limited resources may start a profile containing only dependencies required by the active phase.

Record the clean-start duration, image and volume footprint, and idle resource use for each verified demonstration checkpoint. Do not state a local resource requirement before measuring it on the named environment.

## Clean-checkout verification

Every closed phase must verify its path from:

- fresh checkout;
- no existing volumes;
- supported tool versions;
- documented environment template;
- no private manual steps.
