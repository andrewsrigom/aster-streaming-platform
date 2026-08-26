# Handoff

Phase 00 is verified and released at `da7e6d0`, and P01-R01 is released on `main` at `b4082e6`. P01-R02 fresh-state implementation and evidence passed at `3fa3994`/`fc8d826`, but automated review comment `3861318803` proved that released P01-R01 containers lack the new service-level Aster labels and are refused by the reset. Manual review also found that Aster-prefixed resources without a project label can be hidden from label-only discovery. P01-R02 is reopened and `IN_PROGRESS`; P01-R03 remains queued but must not start. No application code exists.

The verified checkpoint contains exact official PostgreSQL `18.6` and Redis `8.10.0` images, explicit public project `aster`, no host ports, an internal network, persistent PostgreSQL state, disposable Redis state, finite resources, protocol health, one-shot initialization, ongoing status, protected CI policy, operator documentation, separate third-party notices, and Phase 01 evidence. Its destructive reset requires explicit local intent and confirmation, rejects common hosted and ambiguous targets, validates exact resource ownership, preserves images and unrelated Docker state, and proves zero Aster resources.

Every local Compose verification project was inspected by exact project labels and removed with all project resource counts at zero. Both temporary public clones were validated against their origin, commit, and Git state before removal. The 4 unrelated stopped containers remain untouched.

## Resume point

1. Read `AGENTS.md`, `.ai/CONTEXT.md`, and `.ai/CURRENT_STATE.md`.
2. Continue only active P01-R02 remediation in `.ai/CHANGE_PLAN.md`; do not start P01-R03 while review comment `3861318803` remains unresolved.
3. Read `docs/specs/phase-01-local-platform.md`, `docs/operations/CONFIGURATION_AND_ENVIRONMENTS.md`, `SECURITY.md`, and the configuration, security, testing, Node runtime, documentation, and agent skills.
4. Accept only the exact legacy empty or current `local|platform` service-label pair while preserving exact Compose project, service, file, network, volume, authority, environment, scope, and owner checks.
5. Refuse any Aster-prefixed physical container, network, or volume whose project label is absent or different before label-filtered discovery.
6. Prove a same-checkout public upgrade from released P01-R01 startup to corrected P01-R02 reset, then update evidence, repeat all gates and protected CI, reply to and resolve the review, and merge before selecting P01-R03.

## Do not do yet

- Do not scaffold all services.
- Do not expose PostgreSQL or Redis on host ports.
- Do not treat Redis state as durable.
- Do not add a broker, object store, telemetry stack, Node application, HTTP adapter, migrations, or product seed to P01-R03.
- Do not download media or provision hosted infrastructure.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not lock shadcn/ui or Media Chrome before their owning phase records current compatibility and acceptance evidence.
- Do not mark any planned feature as implemented.
