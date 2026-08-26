# Repository Governance

## Current status

Local Git is initialized on `main`; deterministic attributes and ignores, strict source and documentation gates, executable architecture boundaries, staged secret/file and commit-message hooks, the pinned workspace check, and the CI workflow are implemented and locally validated with [source-quality evidence](../../evidence/phase-00/source-quality-foundation.txt), [documentation evidence](../../evidence/phase-00/documentation-validation.txt), and [CI security evidence](../../evidence/phase-00/ci-security-foundation.txt). GitHub templates, the public remote, hosted workflow results, and hosted protections remain planned Phase 00 work.

The repository owner has authorized creation of the public target `andrewsrigom/aster-streaming-platform`. Supported tool selection and local Git initialization are complete; creation remains ordered after the initial quality workflows and a final remote-existence check.

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

Secret and credential scanning is executable locally and in the configured workflow. High-severity registry audit is executable locally and in the configured full CI path. Pull-request dependency and license review is configured, but its hosted result remains unverified until the authorized public repository runs the workflow. Conventional Commit validation for pull-request titles and merge results remains planned and must not be described as executable yet.

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
| Documentation and security | Every run | No | Documentation, tracked secret, CI policy, and governance-tool tests |
| Install and source quality | Non-draft executable/configuration changes, `main`, and manual fallback | Yes | Frozen install, source gates, and high-severity registry audit |
| Dependency review | Non-draft pull requests | No | New dependency vulnerability, scope, and reviewed-license policy |
| CI required | Every run | No | Stable result over every applicable prerequisite |

The workflow uses `pull_request`, a `main`-only `push`, and `workflow_dispatch`; it does not use `pull_request_target` or feature-branch pushes. Superseded pull-request or ref runs cancel through concurrency grouping. Every job receives only `contents: read`, checkout persistence is disabled, and no repository secret is referenced.

Current external actions are pinned to reviewed full commits for checkout `v7.0.1`, setup-node `v7.0.0`, cache `v6.1.0`, and dependency-review `v5.0.0`. The local policy validator rejects a movable tag, unknown action, changed pin, write permission, secret context, broad push trigger, missing cancellation, missing command, or weakened aggregate. Action and runner upgrades are focused supply-chain changes with new evidence.

The pnpm cache contains only the content-addressed store and is keyed by runner OS and lockfile hash. Restored content is untrusted; `pnpm install --frozen-lockfile` still verifies and materializes dependencies. No credential, `node_modules` tree, or build output belongs in the cache.

## GitHub repository settings

The planned public repository is:

```text
github.com/andrewsrigom/aster-streaming-platform
```

Planned baseline settings:

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
- secret scanning and push protection enabled where the public-repository capability supports them;
- code scanning enabled once representative source exists;
- Actions workflow permissions set to read repository contents by default.

Required status-check names are configured only after the workflows have run and GitHub exposes their stable names.

## Authorized creation sequence

Steps 1 through 4 are implemented locally. The public remote remains absent and steps 5 through 10 remain pending.

1. Complete P00-R03 and record supported Node.js and pnpm versions.
2. Complete the local Git and ignore-policy part of P00-R02 with `main` as the initial branch.
3. Add the initial workspace and repository checks without future-service scaffolding.
4. Define and validate the first GitHub Actions workflows locally where possible.
5. Confirm the target does not already exist and the configured GitHub account is still `andrewsrigom`.
6. Create `andrewsrigom/aster-streaming-platform` as public from the existing local repository and add `origin` without generating a second README, license, or ignore file.
7. Push the reviewed local `main`, observe the first workflows, and keep the remote unclaimed as protected until their results are known.
8. Apply the `main` ruleset, merge settings, security settings, and Dependabot configuration.
9. Query the resulting settings and store the redacted configuration audit under `evidence/phase-00/`.
10. Run the clean-checkout gate through the public clone before closing Phase 00.

Remote creation is authorized, but each step remains subject to the Phase 00 order and evidence gate. No token, credential value, or private GitHub configuration belongs in repository files or evidence.

## Recovery

- A failed local hook does not mutate the remote; fix the input or use a documented diagnostic bypass and rely on CI.
- A failed PR gate blocks merge and exposes the owning job.
- A misconfigured required check is corrected through the ruleset audit; it is not bypassed as routine workflow.
- A leaked secret is revoked first, removed from the current tree and history as required, and followed by a security review.
- A partial remote-creation failure leaves local Git authoritative until origin, default branch, workflows, and protections are inspected.
