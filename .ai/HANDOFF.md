# Handoff

P00-R01, the Phase 00 alignment audit, P00-R11, P00-R03, P00-R02, P00-R04, P00-R05, P00-R06, both P00-R07 repository-governance work items, and P00-R08 repository-memory validation are complete. P00-R09 is locally implemented on `docs/foundation-command-contract` and remains in progress until its protected hosted checks pass. No application implementation has started.

The repository has an exact Node.js and pnpm toolchain, deterministic root-only workspace, strict source, documentation, repository-memory, security, CI-policy, and public-contribution gates, lightweight repository hooks, bounded redacting secret scans, and a locally and hosted-validated CI workflow. The root README now exposes exact executable foundation commands and distinguishes them from future Docker and playable demonstrations. A real bounded cleanup, frozen recovery, and uncached twenty-task graph with 78 focused tests pass. Local P00-R09 evidence is indexed in `evidence/phase-00/developer-command-contract.txt`.

The authorized public repository exists at `andrewsrigom/aster-streaming-platform`, `origin` is configured, and the first hosted `main` and protected pull-request workflows passed. Community files, merge settings, read-only Actions defaults, vulnerability alerts and fixes, Dependabot security updates, secret scanning and push protection, private vulnerability reporting, hosted dependency review, and the no-bypass `Protect main` ruleset are queried and recorded in `evidence/phase-00/public-repository-governance.txt`.

## Resume point

1. Read `AGENTS.md`.
2. Read `.ai/CONTEXT.md`.
3. Read `.ai/CURRENT_STATE.md`.
4. Read `docs/specs/phase-00-foundation.md`.
5. Continue only the `IN_PROGRESS` P00-R09 command-contract item on `docs/foundation-command-contract`.
6. Review the root command path, cleanup allowlist and adverse tests, phase-ownership wording, raw evidence, and current Git diff.
7. Commit the coherent implementation, tests, documentation, evidence, and active repository-memory state.
8. Push one branch and open a protected pull request with P00-R09, local results, cleanup behavior, security boundary, and rollback details.
9. Require repository-memory, documentation/security, full source quality, dependency review, and `CI required` to pass; address review findings without bypass.
10. Record the hosted result, mark P00-R09 done, squash merge, verify post-merge `main`, and only then select P00-R10 for the clean public-clone phase gate.

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
