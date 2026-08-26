# Handoff

Phase 00 is verified and released at `da7e6d0`. P01-R01 candidate `90e497b` passed its local, public-clone, and protected hosted paths, but automated review discussion `3860940991` found that inherited `COMPOSE_PROJECT_NAME` could redirect the documented commands. P01-R01 is active again with explicit project-name remediation in progress; P01-R02 remains blocked. No application code exists.

The verified checkpoint contains exact official PostgreSQL `18.6` and Redis `8.10.0` images, no host ports, an internal network, persistent PostgreSQL state, disposable Redis state, finite resources, protocol health, one-shot initialization, ongoing status, protected CI policy, operator documentation, separate third-party notices, and Phase 01 evidence.

Both local Compose verification projects were inspected by exact project labels and removed with all project resource counts at zero. The temporary public clone was validated against its origin and commit before removal. The 4 unrelated stopped containers remain untouched.

## Resume point

1. Read `AGENTS.md`, `.ai/CONTEXT.md`, and `.ai/CURRENT_STATE.md`.
2. Continue only P01-R01 through `.ai/CHANGE_PLAN.md`; do not start a second implementation while review remediation is incomplete.
3. Read `docs/specs/phase-01-local-platform.md`, `docs/operations/LOCAL_DEVELOPMENT.md`, `SECURITY.md`, and the relevant agent skills.
4. Verify the corrected commands with a hostile `COMPOSE_PROJECT_NAME`, a clean public clone, protected CI, and review-thread resolution.
5. Close P01-R01 only after every corrected gate passes and exact temporary cleanup is proven.
6. Then select P01-R02 through a new active plan; do not widen it into applications, migrations, seed data, broker, storage, telemetry, or product schemas.

## Do not do yet

- Do not scaffold all services.
- Do not expose PostgreSQL or Redis on host ports.
- Do not treat Redis state as durable.
- Do not add a broker, object store, telemetry stack, Node application, HTTP adapter, migrations, or product seed to P01-R02.
- Do not download media or provision hosted infrastructure.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not lock shadcn/ui or Media Chrome before their owning phase records current compatibility and acceptance evidence.
- Do not mark any planned feature as implemented.
