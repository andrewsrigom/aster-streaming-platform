# Handoff

Phase 00 is verified. P00-R01 through P00-R11 have linked evidence, the corrected public candidate at `8b45b29` passed the documented clean bootstrap without manual supplementation, and protected pull request 5 run `32943620872` passed. No application implementation has started.

The repository has an exact Node.js and pnpm toolchain, deterministic root-only workspace, strict source, documentation, repository-memory, security, CI-policy, and public-contribution gates, lightweight repository hooks, bounded redacting secret scans, and a locally and hosted-validated CI workflow. Clean-checkout measurements, the original hook-activation finding, the corrected candidate result, limitations, and the Phase 01 capability observations are in `evidence/phase-00/clean-checkout-closeout.txt`.

The authorized public repository exists at `andrewsrigom/aster-streaming-platform`. Squash-only merging, automatic branch cleanup, read-only Actions defaults, immutable action SHA pinning, vulnerability alerts and fixes, Dependabot security updates, secret scanning with push protection, private vulnerability reporting, and the no-bypass `Protect main` ruleset are verified.

## Resume point

1. Read `AGENTS.md`.
2. Read `.ai/CONTEXT.md` and `.ai/CURRENT_STATE.md`.
3. Confirm pull request 5 was squash-merged and its post-merge `main` workflow passed; this is the release observation for the already verified Phase 00 candidate.
4. Select only `P01-R01`, the first `READY` work item in `.ai/WORK_QUEUE.md`.
5. Read `docs/specs/phase-01-local-platform.md`, every referenced ADR, and the required repository skills before creating the new active change plan.
6. Select supported local dependency versions, images, resource bounds, ports, health behavior, diagnostics, and rollback from current official compatibility evidence.
7. Implement only the smallest Docker-only runtime checkpoint owned by P01-R01; do not absorb later Phase 01 requirements merely to populate the architecture.

## Do not do yet

- Do not scaffold all services.
- Do not download media.
- Do not provision hosted infrastructure.
- Do not implement GraphQL schemas.
- Do not create placeholder dashboards.
- Do not scaffold future application or service packages merely to populate the workspace.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not lock shadcn/ui or Media Chrome before their owning phase records current compatibility and acceptance evidence.
- Do not mark any planned feature as implemented.
