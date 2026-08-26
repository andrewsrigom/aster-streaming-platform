# Handoff

P00-R01, the Phase 00 alignment audit, P00-R11, P00-R03, P00-R02, P00-R04, P00-R05, P00-R06, and both P00-R07 repository-governance work items are complete. No application implementation has started.

The repository has an exact Node.js and pnpm toolchain, deterministic root-only workspace, strict source, documentation, security, CI-policy, and public-contribution gates, lightweight repository hooks, bounded redacting secret scans, and a locally and hosted-validated CI workflow. The complete graph passes eighteen tasks and 62 focused tests. Passing evidence is indexed under `evidence/phase-00/`, including `public-repository-governance.txt` for the latest work item.

The authorized public repository exists at `andrewsrigom/aster-streaming-platform`, `origin` is configured, and the first hosted `main` and protected pull-request workflows passed. Community files, merge settings, read-only Actions defaults, vulnerability alerts and fixes, Dependabot security updates, secret scanning and push protection, private vulnerability reporting, hosted dependency review, and the no-bypass `Protect main` ruleset are queried and recorded in `evidence/phase-00/public-repository-governance.txt`.

## Resume point

1. Read `AGENTS.md`.
2. Read `.ai/CONTEXT.md`.
3. Read `.ai/CURRENT_STATE.md`.
4. Read `docs/specs/phase-00-foundation.md`.
5. Select only the first `READY` item: integrate `.ai/` state checks into the contribution workflow for P00-R08.
6. Move it to `IN_PROGRESS` and write `.ai/CHANGE_PLAN.md` before implementation.
7. Define bounded rules for queue status, active-plan state, required memory files, session ordering, and handoff consistency without attempting semantic proof of every statement.
8. Add focused adverse fixtures, integrate the check into local and CI governance paths, capture evidence, and use the protected pull-request flow.
9. Keep exact bootstrap/demo/cleanup documentation in the separate P00-R09 item.
10. Keep clean public-clone and Phase 00 closure in P00-R10.

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
