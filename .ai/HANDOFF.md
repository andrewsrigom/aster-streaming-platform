# Handoff

Phase 00 is verified and released at `da7e6d0`, and P01-R01 is released on `main` at `b4082e6`. P01-R02 is verified at implementation commit `3fa3994` on `feat/p01-r02-local-reset`: fixed-target and hosted-path refusals, populated and partial-state reset, zero postconditions, clean recovery, 18 focused tests, 18 CI tests, 22 uncached repository tasks, audit, unrelated-resource preservation, and a Docker-only clean public checkout passed. P01-R02 is `DONE`, no work item is active, and P01-R03 is the first `READY` item. No application code exists.

The verified checkpoint contains exact official PostgreSQL `18.6` and Redis `8.10.0` images, explicit public project `aster`, no host ports, an internal network, persistent PostgreSQL state, disposable Redis state, finite resources, protocol health, one-shot initialization, ongoing status, protected CI policy, operator documentation, separate third-party notices, and Phase 01 evidence. Its destructive reset requires explicit local intent and confirmation, rejects common hosted and ambiguous targets, validates exact resource ownership, preserves images and unrelated Docker state, and proves zero Aster resources.

Every local Compose verification project was inspected by exact project labels and removed with all project resource counts at zero. Both temporary public clones were validated against their origin, commit, and Git state before removal. The 4 unrelated stopped containers remain untouched.

## Resume point

1. Read `AGENTS.md`, `.ai/CONTEXT.md`, and `.ai/CURRENT_STATE.md`.
2. Confirm whether P01-R02 has passed its protected pull request and post-merge `main` run; if not, finish only that integration and do not start another implementation while its state is ambiguous.
3. Read `docs/specs/phase-01-local-platform.md`, `docs/operations/CONFIGURATION_AND_ENVIRONMENTS.md`, `SECURITY.md`, and the configuration, security, testing, Node runtime, documentation, and agent skills.
4. Select only P01-R03, move it to `IN_PROGRESS`, and create `.ai/CHANGE_PLAN.md` before implementation.
5. Resolve the pending configuration-library decision with current compatibility, maintenance, license, security, runtime-cost, and exit-strategy evidence; do not select unrelated Phase 01 dependencies.
6. Implement only bounded process-start validation, secret classification and redaction metadata, safe startup diagnostics, adverse tests, and the smallest reusable package boundary needed by P01-R03.

## Do not do yet

- Do not scaffold all services.
- Do not expose PostgreSQL or Redis on host ports.
- Do not treat Redis state as durable.
- Do not add a broker, object store, telemetry stack, Node application, HTTP adapter, migrations, or product seed to P01-R03.
- Do not download media or provision hosted infrastructure.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not lock shadcn/ui or Media Chrome before their owning phase records current compatibility and acceptance evidence.
- Do not mark any planned feature as implemented.
