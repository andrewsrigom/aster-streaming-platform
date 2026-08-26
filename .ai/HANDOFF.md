# Handoff

P00-R01, the Phase 00 alignment audit, P00-R11, P00-R03, and P00-R02 are complete. No application implementation has started.

P00-R11 added the engineering demonstration contract, progressive Docker-only checkpoints, coherent commit and tiered-check policy, and public GitHub governance. The repository owner authorized the future public target `andrewsrigom/aster-streaming-platform`; it does not exist yet and remains sequenced after local Git, checks, and CI.

P00-R03 pins Node.js `24.19.0` and pnpm `11.24.0` and provides a dependency-free toolchain guard. P00-R02 initializes local Git on `main`, the root-only workspace and lockfile, deterministic attributes and ignores, and Turborepo `2.10.12`. Passing evidence is in `evidence/phase-00/toolchain-selection.txt` and `evidence/phase-00/workspace-foundation.txt`.

## Resume point

1. Read `AGENTS.md`.
2. Read `.ai/CONTEXT.md`.
3. Read `.ai/CURRENT_STATE.md`.
4. Read `docs/specs/phase-00-foundation.md`.
5. Select only the first `READY` item: P00-R04, strict TypeScript and fast code-quality gates.
6. Move P00-R04 to `IN_PROGRESS` and create `.ai/CHANGE_PLAN.md` from `docs/templates/WORK_ITEM_TEMPLATE.md`.
7. Select the smallest compatible toolset that covers strict TypeScript, format checking, lint, unused code, architecture boundaries, and commit metadata without making every commit run the full repository gate.

## Do not do yet

- Do not scaffold all services.
- Do not download media.
- Do not provision hosted infrastructure.
- Do not implement GraphQL schemas.
- Do not create placeholder dashboards.
- Do not scaffold future application or service packages merely to populate the workspace.
- Do not create the authorized public remote before local Git initialization, initial checks, and CI are ready according to `docs/operations/REPOSITORY_GOVERNANCE.md`.
- Do not lock shadcn/ui or Media Chrome before their owning phase records current compatibility and acceptance evidence.
- Do not mark any planned feature as implemented.
