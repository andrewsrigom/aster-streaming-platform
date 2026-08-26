# Handoff

P00-R01, the Phase 00 alignment audit, P00-R11, P00-R03, P00-R02, P00-R04, P00-R05, P00-R06, and the local-template part of P00-R07 are complete. The public-repository part of P00-R07 is in progress. No application implementation has started.

The repository has an exact Node.js and pnpm toolchain, deterministic root-only workspace, strict source, documentation, security, CI-policy, and public-contribution gates, lightweight repository hooks, bounded redacting secret scans, and a locally validated CI workflow. The complete forced graph passes eighteen tasks and 61 focused tests. Passing evidence is indexed under `evidence/phase-00/`, including `community-governance.txt` for the latest work item.

The authorized public repository exists at `andrewsrigom/aster-streaming-platform`, `origin` is configured, and the first hosted `main` workflow passed. Community files, merge settings, read-only Actions defaults, vulnerability alerts and fixes, Dependabot security updates, secret scanning and push protection, private vulnerability reporting, and the no-bypass `Protect main` ruleset are queried and recorded in `evidence/phase-00/public-repository-governance.txt`. The governance branch still needs its protected pull-request workflow and dependency-review result before P00-R07 closes.

## Resume point

1. Read `AGENTS.md`.
2. Read `.ai/CONTEXT.md`.
3. Read `.ai/CURRENT_STATE.md`.
4. Read `docs/specs/phase-00-foundation.md`.
5. Continue only the `IN_PROGRESS` P00-R07 public-repository item.
6. Validate and commit the governance evidence on `chore/public-repository-governance`.
7. Push the branch, open one coherent pull request, and wait for the dependency-review and stable aggregate checks.
8. If the checks pass, record their public run identifiers, update the evidence and memory, and rerun the protected path after that final branch commit.
9. Squash merge only after the required check is green, verify the post-merge `main` workflow, synchronize local `main`, and delete the merged branch.
10. Start P00-R08 `.ai/` workflow integration only after P00-R07 is unambiguous.

## Do not do yet

- Do not scaffold all services.
- Do not download media.
- Do not provision hosted infrastructure.
- Do not implement GraphQL schemas.
- Do not create placeholder dashboards.
- Do not scaffold future application or service packages merely to populate the workspace.
- Do not create or mutate a different repository if the configured account or exact target check does not match the authorization.
- Do not lock shadcn/ui or Media Chrome before their owning phase records current compatibility and acceptance evidence.
- Do not mark any planned feature as implemented.
