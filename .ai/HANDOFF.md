# Handoff

P00-R01, the Phase 00 alignment audit, P00-R11, P00-R03, P00-R02, P00-R04, P00-R05, P00-R06, and both P00-R07 repository-governance work items are complete. P00-R08 repository-memory validation is implemented locally and remains in progress until its protected hosted checks pass. No application implementation has started.

The repository has an exact Node.js and pnpm toolchain, deterministic root-only workspace, strict source, documentation, repository-memory, security, CI-policy, and public-contribution gates, lightweight repository hooks, bounded redacting secret scans, and a locally and hosted-validated CI workflow. The forced complete graph passes twenty tasks and 73 focused tests. Current local evidence is indexed in `evidence/phase-00/ai-state-workflow.txt`.

The authorized public repository exists at `andrewsrigom/aster-streaming-platform`, `origin` is configured, and the first hosted `main` and protected pull-request workflows passed. Community files, merge settings, read-only Actions defaults, vulnerability alerts and fixes, Dependabot security updates, secret scanning and push protection, private vulnerability reporting, hosted dependency review, and the no-bypass `Protect main` ruleset are queried and recorded in `evidence/phase-00/public-repository-governance.txt`.

## Resume point

1. Read `AGENTS.md`.
2. Read `.ai/CONTEXT.md`.
3. Read `.ai/CURRENT_STATE.md`.
4. Read `docs/specs/phase-00-foundation.md`.
5. Continue only the `IN_PROGRESS` P00-R08 repository-memory item on `chore/ai-state-validation`.
6. Review and commit the coherent validator, tests, workflow integration, documentation, memory, and local evidence.
7. Push the branch and open one protected pull request; require the repository-memory, documentation/security, full quality, dependency-review, and aggregate jobs to pass.
8. Address review findings without administrative bypass, record the hosted result, reset the active plan, and mark P00-R08 done only after verification.
9. Squash merge, verify post-merge `main`, synchronize local state, and then select P00-R09.
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
