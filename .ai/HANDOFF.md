# Handoff

Phase 00 is verified and released at `da7e6d0`. P01-R01 is verified on public candidate `563d09f`: its local runtime experiment, exact cleanup, clean public-checkout command, protected pull request 6 run `32947483503`, dependency review, complete quality path, hosted `Local platform` job, and stable aggregate passed. P01-R01 is `DONE`, no work item is active, and P01-R02 is the first `READY` item. No application code exists.

The verified checkpoint contains exact official PostgreSQL `18.6` and Redis `8.10.0` images, no host ports, an internal network, persistent PostgreSQL state, disposable Redis state, finite resources, protocol health, one-shot initialization, ongoing status, protected CI policy, operator documentation, separate third-party notices, and Phase 01 evidence.

Both local Compose verification projects were inspected by exact project labels and removed with all project resource counts at zero. The temporary public clone was validated against its origin and commit before removal. The 4 unrelated stopped containers remain untouched.

## Resume point

1. Read `AGENTS.md`, `.ai/CONTEXT.md`, and `.ai/CURRENT_STATE.md`.
2. Confirm the final pull request 6 head and post-merge `main` run if this branch has not yet been integrated; do not start a second implementation while integration state is ambiguous.
3. Read `docs/specs/phase-01-local-platform.md`, `docs/operations/LOCAL_DEVELOPMENT.md`, `SECURITY.md`, and the relevant agent skills.
4. Select only P01-R02, move it to `IN_PROGRESS`, and create `.ai/CHANGE_PLAN.md` from the work-item template before implementation.
5. Design an explicit destructive reset that proves local environment, exact Aster project and volume labels, deliberate confirmation, refusal of hosted targets, idempotence, diagnosable partial failure, and preservation of unrelated Docker state.
6. Reuse the verified `infra/compose/compose.yml`; do not widen P01-R02 into applications, migrations, seed data, broker, storage, telemetry, or product schemas.

## Do not do yet

- Do not scaffold all services.
- Do not expose PostgreSQL or Redis on host ports.
- Do not treat Redis state as durable.
- Do not add a broker, object store, telemetry stack, Node application, HTTP adapter, migrations, or product seed to P01-R02.
- Do not download media or provision hosted infrastructure.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not lock shadcn/ui or Media Chrome before their owning phase records current compatibility and acceptance evidence.
- Do not mark any planned feature as implemented.
