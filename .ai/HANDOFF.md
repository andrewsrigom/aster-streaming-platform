# Handoff

Phase 00 is verified and released at `da7e6d0`. P01-R01 is active on `feat/phase-01-local-platform`; the core local-platform candidate is implemented and `PASS_LOCAL`, but no Phase 01 commit or protected hosted smoke exists yet. No application code exists.

The candidate contains the smallest Docker-only checkpoint: exact official PostgreSQL `18.6` and Redis `8.10.0` images, no host ports, an internal network, persistent PostgreSQL state, disposable Redis state, finite resources, protocol health, one-shot initialization, ongoing status, protected CI policy, documentation, third-party notices, and Phase 01 evidence. Seven platform adverse tests, 17 CI policy/classifier tests, Compose parsing, and the source gate pass.

The unique `aster-p01-r01-dev` project passed empty startup, version and protocol checks, resource inspection, PostgreSQL persistence, Redis disposal, normal stop/restart, dependency-failure detection, and recovery. Exact label checks then proved its 4 containers, 1 internal network, and 1 verification volume before scoped removal; all project resource counts are zero. The 4 unrelated stopped containers remain untouched.

## Resume point

1. Read `AGENTS.md`, `.ai/CONTEXT.md`, and `.ai/CURRENT_STATE.md`.
2. Read `docs/specs/phase-01-local-platform.md`, the accepted PostgreSQL, Redis, event, observability, monorepo, and bounded-context ADRs, and the relevant skills named by the phase.
3. Continue only active `P01-R01` on `feat/phase-01-local-platform` using `.ai/CHANGE_PLAN.md`.
4. Review `infra/compose/compose.yml`, `tools/verify-local-platform.mjs`, the CI decision path, public documentation, license record, and `evidence/phase-01/local-platform-checkpoint.txt`.
5. Run final repository gates and inspect the current diff for unsupported Phase 01 claims or widened scope.
6. Publish one coherent candidate, clone its public branch into a unique empty checkout, run the exact Docker-only README command, and require the protected `Local platform` job before P01-R01 completion.

## Do not do yet

- Do not scaffold all services.
- Do not expose PostgreSQL or Redis on host ports.
- Do not treat Redis state as durable.
- Do not add a broker, object store, telemetry stack, Node application, HTTP adapter, migrations, or product seed to P01-R01.
- Do not implement the destructive reset before P01-R02.
- Do not download media or provision hosted infrastructure.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not lock shadcn/ui or Media Chrome before their owning phase records current compatibility and acceptance evidence.
- Do not mark any planned feature as implemented.
