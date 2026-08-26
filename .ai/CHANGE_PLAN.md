# Work Item: Publish and protect the authorized GitHub repository

- Status: IN_PROGRESS
- Owner: Repository governance and release operations
- Phase: 00
- Requirement IDs: P00-R07; supports P00-R06, P00-R10, QLT-R01, QLT-R04, and SEC-R05
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

The reviewed local `main` history is published to the explicitly authorized public repository `andrewsrigom/aster-streaming-platform` without generated starter files. The first hosted workflow and community surfaces are observed, merge and Actions defaults are constrained, available repository security features are enabled, and `main` receives an audited ruleset only after GitHub exposes the stable `CI required` check. Redacted API evidence distinguishes configured, unavailable, and unverified controls.

## Current behavior

The authorized public repository was created from reviewed local `main` after the active identity and exact target absence were verified. The first hosted `main` workflow passed, public community files are recognized, supported repository security and least-privilege Actions settings are enabled, and the active `Protect main` ruleset has no bypass actors. The remaining acceptance step is to send this governance branch through the protected pull-request path and record the hosted dependency-review result before merge.

## Proposed behavior

Use the authenticated GitHub CLI only after confirming the active login equals `andrewsrigom` and an exact repository lookup returns not found. Create an empty public repository, add `origin`, push `main`, observe the hosted `CI` workflow, inspect community files through GitHub, then apply the documented issues, wiki, squash-only merge, branch cleanup, least-privilege Actions, vulnerability, secret, private-reporting, and ruleset settings supported by the current public-repository account. Query every resulting state and capture only redacted output.

## Boundaries

- Owning context: Repository governance and release operations; no product bounded context or durable product data owner changes.
- Affected services/packages: Local Git remote configuration, GitHub repository metadata, Actions, community surfaces, security settings, ruleset, and Phase 00 governance evidence.
- Authoritative data: Local reviewed Git history before first push; GitHub becomes the authoritative public remote after creation. Checked-in workflow and community files remain source-controlled authority for their contents.
- Read models/caches: GitHub workflow runs, check suites, dependency graph, security status, and API queries are observed projections; Actions and pnpm caches are reconstructable.
- Trust boundaries: GitHub CLI credentials, active account identity, exact owner/name lookup, public Git contents, Actions tokens and runners, repository APIs, third-party action commits, contributor input, and redacted evidence.
- External dependencies: GitHub CLI and APIs, Git transport, hosted Actions runners, npm audit endpoint, and public GitHub feature availability.

## Invariants

- Only `andrewsrigom/aster-streaming-platform` may be created; identity mismatch, ambiguous existence, authentication failure, or unexpected local remote stops mutation.
- Creation uses the existing local repository and does not generate a README, license, ignore file, initial commit, alternate branch, or unrelated hosted resource.
- The repository is public and `main` is the default branch.
- No token, credential, private email, raw authentication header, secret value, or private account configuration enters logs or evidence.
- The first workflow result is observed before `CI required` is configured as a required status check.
- Merge commits and rebase merges are disabled; squash merge, automatic head-branch deletion, issues, and linear protected history are enabled where supported.
- Default Actions permissions remain read-only and workflows cannot approve pull requests.
- Direct update, force push, and deletion of `main` are blocked through a ruleset; pull requests and the stable `CI required` result are required without inventing an unavailable reviewer.
- Secret scanning, push protection, private vulnerability reporting, dependency alerts, and security updates are enabled only through supported APIs and then queried.
- A control that is unavailable or returns an ambiguous response remains explicitly unverified; it is never documented as active from intent alone.
- Local Git remains recoverable if remote creation or configuration stops partway; destructive history rewriting and remote deletion are prohibited.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Active account differs from `andrewsrigom` | Stop before any mutation | Redacted login and authentication status |
| Exact target already exists | Stop and inspect ownership/state; do not adopt or overwrite it implicitly | Repository lookup result |
| Repository creation fails | Keep local Git authoritative and record API/CLI failure without retrying ambiguous creation blindly | CLI exit and exact target re-query |
| Remote add or push fails | Inspect local remote and hosted refs, then resume idempotently without force | Git remote/ref query |
| Hosted CI fails | Inspect job logs, correct source locally, commit coherently, and push normally; do not protect a failing check | Workflow run and job result |
| Hosted check name is not exposed | Defer required-status rule while retaining other protections | Check-suite query |
| Setting or security feature is unsupported | Record unavailable state and safe fallback; do not claim enabled | HTTP status and redacted state query |
| Ruleset payload is rejected | Query existing rulesets and API compatibility, correct narrowly, and verify; never weaken history protections silently | Ruleset API response |
| Evidence command exposes sensitive output | Do not store it; rerun with selected fields or redaction | Evidence review failure |

## Data and contracts

- Schema/migration: None.
- GraphQL: None.
- Events: Git push and GitHub workflow/check events only; no product events.
- Cache: GitHub Actions and pnpm caches remain non-authoritative; clean installation remains required later by P00-R10.
- Compatibility: Current GitHub CLI, REST API, rulesets, Actions, public repository community files, and repository-security capabilities are queried from official documentation and live responses.
- Retention/deletion: The public Git history is durable. Workflow logs and caches follow GitHub retention. Evidence stores selected public identifiers and settings, never credentials.

## Security and privacy

- Authorization: Use only the already authenticated owner account and explicitly authorized target; verify scopes before mutation.
- Input limits: Exact constant owner/name, selected API fields, bounded workflow waits, no untrusted shell interpolation, and no remote payload from public contributors during creation.
- Sensitive data: Authentication tokens and headers remain inside GitHub CLI storage; evidence excludes them and any private email.
- Abuse cases: Typosquatting, wrong-account publication, accidental private-history disclosure, workflow-token escalation, compromised action tags, bypassable rules, public secret disclosure, and false protection claims.

## Implementation steps

1. Query GitHub CLI version, authenticated login and scopes, local remote count, exact destination absence, and current official repository/ruleset/security API contracts.
2. Create the exact empty public repository from the existing local repository, add `origin`, and verify owner, visibility, default branch, and remote URL before push.
3. Push reviewed `main` without force, locate the triggered `CI` run, and wait in bounded intervals for the aggregate result.
4. Inspect failed jobs if any; otherwise verify `CI required`, community files, dependency graph availability, and public source content from GitHub.
5. Apply repository merge/features, Actions-permission, vulnerability/security, and private-reporting settings one category at a time; query each result.
6. Create the active `main` ruleset with pull-request, required-status-check, linear-history, non-fast-forward, and deletion protections supported by the current API, then query its exact rules and bypass actors.
7. Run a non-mutating remote audit, capture redacted evidence, update repository governance and memory, validate and commit locally, push the governance evidence, and observe that final hosted run.

## Tests

- Domain: Exact target and identity comparison, expected setting assertions, and required ruleset-rule inventory in a bounded audit script or query.
- Application: GitHub CLI/API selected-field queries, local remote/ref verification, and idempotent state checks before each mutation.
- Integration: Actual public repository creation, ordinary Git push, hosted Actions run, community-file retrieval, repository settings, security features, and ruleset queries.
- Contract: Public visibility, `main`, issues, wiki disabled, squash-only merge, branch cleanup, read-only Actions default, workflow approval disabled, immutable action pins, stable `CI required`, no ruleset bypass actor, and expected protection rules.
- Browser: Not required if public raw/API retrieval proves community files; visual rendering may be inspected only if the authenticated browser is already available and adds evidence.
- Performance/failure: Bounded polling and cancellation observation; no load test applies.

## Evidence

- Commands: Version/auth/identity queries, target existence query, creation and remote verification, push, workflow run and jobs, selected repository/settings/security/ruleset APIs, community-file retrieval, local and remote gates, and final hosted run.
- Raw artifact path: `evidence/phase-00/public-repository-governance.txt`
- Acceptance result: Pending protected pull-request workflow.

## Rollback or recovery

Before the first push, remove only the exact local `origin` if creation failed and the remote state proves it safe; keep all local commits. After publication, do not delete the public repository or rewrite history. Correct settings idempotently through reviewed API calls, push additive fixes normally, and record unavailable capabilities. Repository deletion or ownership transfer requires new explicit owner authorization.

## Documentation updates

- `README.md` only if the public repository link belongs in its current Phase 00 scope
- `SECURITY.md`
- `docs/operations/REPOSITORY_GOVERNANCE.md`
- `docs/operations/LOCAL_DEVELOPMENT.md` if hosted commands become part of the contract
- `docs/00-start-here/FILE_INDEX.md`
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md`
- `.ai/DECISIONS_LEDGER.md` if a capability or protection decision changes
- `evidence/phase-00/README.md`

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
