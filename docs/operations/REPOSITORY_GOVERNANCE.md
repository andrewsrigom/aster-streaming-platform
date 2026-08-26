# Repository Governance

## Current status

Local Git is initialized on `main`; deterministic attributes and ignores, strict source, documentation, and public-contribution gates, executable architecture boundaries, staged secret/file and commit-message hooks, the pinned workspace check, the CI workflow, and active GitHub community templates are implemented and locally validated with [source-quality evidence](../../evidence/phase-00/source-quality-foundation.txt), [documentation evidence](../../evidence/phase-00/documentation-validation.txt), [CI security evidence](../../evidence/phase-00/ci-security-foundation.txt), and [community-governance evidence](../../evidence/phase-00/community-governance.txt).

The authorized [public repository](https://github.com/andrewsrigom/aster-streaming-platform) is implemented and audited. Its first hosted `main` and protected pull-request workflows passed, including hosted dependency review. GitHub recognizes both issue templates and the pull-request template, and the repository uses squash-only merging, read-only default workflow permissions, automated branch cleanup, supported security features, and an active no-bypass `main` ruleset. Exact observed settings and remaining capability limits are recorded in [public-repository evidence](../../evidence/phase-00/public-repository-governance.txt).

## Goals

- keep `main` reviewable, reproducible, and releasable;
- preserve coherent history without creating microcommits;
- provide fast local feedback and authoritative CI feedback;
- avoid duplicate pipelines and heavyweight checks without a risk-based reason;
- prevent secrets and unsafe dependency or workflow changes from reaching the public repository;
- make every merge traceable to a requirement, defect, experiment, or operational need.

## Branch policy

- `main` is the only long-lived branch and the protected default branch.
- Direct pushes, force pushes, and deletion of `main` are prohibited after the GitHub ruleset is active.
- One branch carries one coherent outcome that can be described and verified as one work item.
- When a Jira key exists, use that exact key as the default branch name.
- Otherwise use `<type>/<short-kebab-description>`, where `type` is normally `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, or `experiment`.
- Branch names beginning with `codex/` are prohibited.
- Delete merged branches after the merge is verified.

## Commit policy

Atomic means coherent and reversible. It does not mean one commit per file, class, function, or mechanical step. A normal work item may reasonably produce one to three reviewable commits; commit count is never an acceptance metric.

Use Conventional Commit-shaped subjects:

```text
<type>(<scope>): <imperative outcome>
```

Examples:

```text
feat(catalog): enforce rights before publication
fix(playback): cancel catalog check after deadline
perf(redis): coalesce concurrent title refreshes
docs(platform): define clean-start demo contract
```

The subject should be concise and describe an outcome. The body records requirement IDs, rationale, migration or compatibility constraints, and evidence when they are not evident from the diff.

Intermediate branch commits may be reorganized before review. The merge uses squash so `main` receives one coherent commit whose message comes from the validated pull-request title and body.

## Tiered local feedback

Quality gates are intentionally split by speed and risk.

| Tier | Trigger | Scope | Intended feedback |
|---|---|---|---|
| Edit | developer action | editor diagnostics and targeted tests | immediate |
| Commit | local commit | commit metadata plus bounded staged-secret scanning and fast staged-file formatting and lint | seconds, not a repository-wide build |
| Push | explicit pre-push or `check:changed` | affected formatting, lint, type checks, unit tests, and documentation | fast enough for normal iteration |
| Pull request | ready-for-review PR | authoritative affected jobs, install integrity, tests, documentation, security, and dependency review | complete merge decision |
| Phase or release gate | explicit command or workflow dispatch | clean install, integration containers, browser, load, failure, media, and release evidence required by the phase | comprehensive and measured |

Local hooks are convenience controls and may be bypassed during diagnosis. CI is authoritative. A new mandatory local check must have a measured feedback cost and a failure class that justifies running it at that tier.

Full integration, browser, container, media, load, soak, CodeQL, and failure-injection work must not run on every local commit.

## Static and architecture gates

The following source gates are implemented:

- deterministic formatting check;
- strict TypeScript compilation without emit;
- type-aware lint rules for correctness and unsafe patterns;
- unused file, export, and dependency detection;
- inward-only domain and application import boundaries;
- no cross-context persistence-model imports;
- no framework, database, Redis, broker, or telemetry SDK in domain and application layers;
- Conventional Commit validation for local commit messages.
- Markdown UTF-8, title, fence, unresolved-merge-marker, local-link, heading-fragment, canonical-terminology, and evidence-supported current-status validation.
- Bounded repository-memory files, queue order and blockers, active-plan binding, resume-target, and session-structure validation.

Secret and credential scanning is executable locally and in the configured workflow. High-severity registry audit is executable locally and in the hosted full CI path. Pull-request dependency and license review is configured and its first hosted execution passed. Conventional Commit validation for pull-request titles and merge results remains planned and must not be described as executable yet.

Auto-fix commands remain separate from check commands. CI runs checks and does not rewrite source.

## Pull-request policy

A pull request represents one work item, not one tiny edit. It includes:

- requirement or defect reference;
- affected owner and boundary;
- observable behavior and failure behavior;
- security, data, observability, and operational impact;
- tests and raw evidence;
- rollback or roll-forward path;
- documentation and `.ai/` state updates.

Draft pull requests may be used for visibility without running the complete merge gate. The authoritative pipeline runs when the pull request becomes ready for review and when its head changes afterward.

For a single-maintainer repository, the initial ruleset requires the pull-request path and status checks but does not require an unavailable external approval. Review approvals can become mandatory when an eligible collaborator exists.

## Public contribution surfaces

GitHub automatically applies [the pull-request template](../../.github/PULL_REQUEST_TEMPLATE.md). It asks for the requirement or defect, ownership and trust boundaries, observable and failure behavior, security and data impact, tests, evidence, recovery, documentation, a coherent-change declaration, and confirmation that the contributor can provide the work under MIT.

The issue chooser offers a [bug report](../../.github/ISSUE_TEMPLATE/bug-report.md) and a [bounded change proposal](../../.github/ISSUE_TEMPLATE/change-proposal.md). Blank contributor issues are disabled. No label, assignee, or external contact is invented. Both issue paths redirect vulnerability details away from public disclosure and require sanitized evidence; the verified private reporting form is linked from [`SECURITY.md`](../../SECURITY.md).

The bounded `community:check` command validates the exact file set, regular bounded UTF-8 inputs, stable Markdown front matter, chooser policy, required contribution topics, MIT terms, separate media rights, and the verified private vulnerability path. Eight adverse tests cover missing, extra, malformed, incomplete, oversized, invalid-UTF-8, symbolic, and missing-private-channel inputs. GitHub's repository API recognizes both issue-template definitions, and the active pull-request template is publicly retrievable.

## CI execution policy

- Feature-branch pushes do not also run a second full workflow when the same revision is covered by a pull-request workflow.
- `pull_request` is the merge-validation trigger; `push` runs only for `main` post-merge verification and release-relevant tags.
- Superseded runs in the same pull request are cancelled through workflow concurrency.
- Package-manager, Turborepo, build, and test caches use lockfile and configuration inputs and never hide a clean-install gate.
- Path-aware or affected-graph execution may skip unrelated expensive jobs, but one stable aggregate required check reports the complete decision.
- Documentation-only changes still run documentation, governance, licensing, and secret checks.
- Security-sensitive workflow changes receive the full relevant security path even when application files are unchanged.
- Scheduled or manually dispatched workflows own broad CodeQL, dependency, container, integration, load, soak, media, and failure suites when a pull-request gate does not require them.
- GitHub Actions permissions default to read-only and elevate only for the job that needs a named permission.
- Third-party actions are pinned to reviewed immutable revisions according to the Phase 00 supply-chain policy.

Gate duration, cache effectiveness, cancellation, and false-positive cost are measured before adding or promoting a check. Slow checks are optimized or moved to a more appropriate tier; they are not silently removed when they protect a required invariant.

## Implemented CI layout

The checked-in `CI` workflow has one authoritative event policy and one stable aggregate job:

| Job | When | Dependency install | Responsibility |
|---|---|---:|---|
| Classify change | Every run | No | Fail-safe full versus documentation-only path |
| Documentation and security | Every run | No | Repository memory, documentation, community contract, tracked secret, CI policy, and governance-tool tests |
| Install and source quality | Non-draft executable/configuration changes, `main`, and manual fallback | Yes | Frozen install, source gates, and high-severity registry audit |
| Dependency review | Non-draft pull requests | No | New dependency vulnerability, scope, and reviewed-license policy |
| CI required | Every run | No | Stable result over every applicable prerequisite |

The workflow uses `pull_request`, a `main`-only `push`, and `workflow_dispatch`; it does not use `pull_request_target` or feature-branch pushes. Superseded pull-request or ref runs cancel through concurrency grouping. Every job receives only `contents: read`, checkout persistence is disabled, and no repository secret is referenced.

Current external actions are pinned to reviewed full commits for checkout `v7.0.1`, setup-node `v7.0.0`, cache `v6.1.0`, and dependency-review `v5.0.0`. The local policy validator rejects a movable tag, unknown action, changed pin, write permission, secret context, broad push trigger, missing cancellation, missing command, or weakened aggregate. Action and runner upgrades are focused supply-chain changes with new evidence.

The pnpm cache contains only the content-addressed store and is keyed by runner OS and lockfile hash. Restored content is untrusted; `pnpm install --frozen-lockfile` still verifies and materializes dependencies. No credential, `node_modules` tree, or build output belongs in the cache.

## GitHub repository settings

The verified public repository is:

```text
github.com/andrewsrigom/aster-streaming-platform
```

Observed baseline settings on 2026-08-26:

- public visibility;
- `main` as default branch;
- issues enabled and wiki disabled;
- squash merge enabled;
- merge commits disabled;
- automatic head-branch deletion enabled;
- a `main` ruleset requiring a pull request, successful required aggregate check, linear history, and protection from force push and deletion;
- no routine bypass of failed required checks;
- dependency graph and Dependabot alerts enabled;
- Dependabot security updates and a low-noise scheduled version-update policy;
- secret scanning and push protection enabled;
- private vulnerability reporting and automated security fixes enabled;
- code scanning deliberately deferred until representative source exists;
- Actions workflow permissions set to read repository contents by default.

The active ruleset is [Protect main](https://github.com/andrewsrigom/aster-streaming-platform/rules/21535199). It has no bypass actors and requires the pull-request path, review-thread resolution, squash merging, strict `CI required` success, linear history, and protection from non-fast-forward updates and deletion. The required check was configured only after the first hosted workflow exposed its stable name and GitHub Actions application identity. An external approval is not required while the repository has only one eligible maintainer.

GitHub also reports a dependency graph with 162 packages and 234 relationships. Secret-scanning validity checks and non-provider patterns were not enabled by the available defaults and remain unclaimed. Code scanning is deliberately deferred until representative application source exists, so no empty or decorative CodeQL result is claimed.

## Authorized creation sequence

Steps 1 through 10 are implemented and audited. The final clean-checkout gate is recorded in the [Phase 00 closeout evidence](../../evidence/phase-00/clean-checkout-closeout.txt).

1. Complete P00-R03 and record supported Node.js and pnpm versions.
2. Complete the local Git and ignore-policy part of P00-R02 with `main` as the initial branch.
3. Add the initial workspace and repository checks without future-service scaffolding.
4. Define and validate the first GitHub Actions workflow and public community templates locally where possible.
5. Confirm the target does not already exist and the configured GitHub account is still `andrewsrigom`.
6. Create `andrewsrigom/aster-streaming-platform` as public from the existing local repository and add `origin` without generating a second README, license, or ignore file.
7. Push the reviewed local `main`, observe the first workflows, and keep the remote unclaimed as protected until their results are known.
8. Apply the `main` ruleset, merge settings, security settings, and Dependabot configuration.
9. Query the resulting settings and store the redacted configuration audit under `evidence/phase-00/`.
10. Run the clean-checkout gate through the public clone before closing Phase 00.

Remote creation used the authorized existing local history and did not generate a second README, license, ignore file, or starter commit. No token, credential value, private email, or private account configuration belongs in repository files or evidence.

## Recovery

- A failed local hook does not mutate the remote; fix the input or use a documented diagnostic bypass and rely on CI.
- A failed PR gate blocks merge and exposes the owning job.
- A misconfigured required check is corrected through the ruleset audit; it is not bypassed as routine workflow.
- A leaked secret is revoked first, removed from the current tree and history as required, and followed by a security review.
- A partial remote-creation failure leaves local Git authoritative until origin, default branch, workflows, and protections are inspected.
