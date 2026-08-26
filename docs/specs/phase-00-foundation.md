# Phase 00 — Repository Foundation

## Objective

Create the smallest trustworthy repository foundation that can enforce documentation, boundaries, quality gates, and context retention before product code begins.

## Product traceability

- Supports: `QLT-R01`, `QLT-R04`.
- This phase establishes enforcement; final product-level quality acceptance remains in Phase 14.

## Prerequisites

- Specification baseline exists.
- A repository owner is available to select a source-code license.

## Deliverables

- canonical MIT license and public contribution policy
- Git repository and deterministic ignore policy
- pnpm workspace and Turborepo configuration
- pinned Node.js and package-manager policy
- strict TypeScript, linting, formatting, and import-boundary rules
- documentation validation and status-claim checks
- CI foundation, secret scanning, and dependency review
- pull request, issue, ADR, experiment, and work-item templates
- verified `.ai/` execution workflow
- engineering demonstration, progressive local demo, and public repository governance contracts

## Requirements

### P00-R01

Select a source-code license, add the canonical license file, and update `LICENSES.md`.
### P00-R02

Ensure the Git repository exists, add a deterministic ignore policy, and initialize a pnpm workspace and Turborepo without creating empty future services.
### P00-R03

Pin the supported Node.js line and package manager through repository tooling; CI and local checks must reject unsupported versions.
### P00-R04

Enable strict TypeScript defaults, formatting, linting, unused-code checks, architecture-aware import restrictions, and fast commit-message validation. Local hooks must operate only on changed input and must not run the complete repository gate on every commit.
### P00-R05

Add Markdown link validation, spelling or terminology checks where useful, and a scanner that rejects unsupported status claims.
### P00-R06

Add CI jobs for install integrity, formatting, linting, type checking, tests, documentation, secret scanning, and dependency review. Use affected-scope execution, dependency caching, concurrency cancellation, path-aware jobs, and non-duplicated triggers while keeping one stable required result.
### P00-R07

Add public contribution governance and templates that define MIT contribution licensing, coherent atomic change scope, commit and pull-request conventions, tiered local and CI gates, and required requirement IDs, failure behavior, evidence, security impact, and rollback.
### P00-R08

Make `.ai/CHANGE_PLAN.md`, current state, queue, session log, and handoff part of the normal workflow.
### P00-R09

Document exact bootstrap, check, and cleanup commands in the root README.
### P00-R10

Produce a Phase 00 evidence index showing every gate passing from a clean checkout.
### P00-R11

Define how every required engineering subject progresses from explanation to implementation, adverse testing, measurement, and operational evidence; define progressive Docker-based demonstration checkpoints; and record public repository governance without changing phase dependencies.

## Invariants

- No future service is scaffolded merely to make the tree look complete.
- Planned behavior is not described as implemented.
- Generated files are deterministic or clearly ignored.
- CI uses the same commands developers run locally.
- The authoritative full gate does not run on every local commit, and GitHub does not run duplicate branch-push and pull-request pipelines for the same revision.
- Commit count is not a quality metric; each commit or squash-merged pull request represents a coherent outcome that can be reviewed and reversed.

## Implementation sequence

1. Resolve the source-code license.
2. Validate compatibility and pin the supported Node.js, pnpm, and repository-tool versions.
3. Initialize Git policy, workspace, and task orchestration.
4. Add TypeScript and code-quality baselines.
5. Add architecture, documentation, and `.ai/` workflow checks.
6. Add CI and public repository governance templates.
7. Document the exact developer commands.
8. Run from a clean checkout and capture evidence.
9. Update `.ai/` state and close the phase.

## Required tests

- Canonical license, contribution-license statement, and media-license separation are consistent.
- Git ignores generated outputs, local secrets, and dependency directories without ignoring required evidence; a generated artifact is excluded only when it is reproducible and intentionally outside the evidence contract.
- Clean install with frozen lockfile.
- Intentional boundary violation fails lint or architecture test.
- Broken Markdown link fails validation.
- Injected secret fixture is detected in a safe test path.
- Unsupported Node.js version is rejected.
- Fast hooks inspect only changed files and commit metadata; broader checks run at pre-push, pull-request, or phase-gate scope according to risk.
- Superseded pull-request runs are cancelled, unchanged areas do not trigger unrelated heavyweight jobs, and the required aggregate result remains deterministic.
- Every required engineering subject maps to owning phases, a handbook, required evidence, and at least one demonstrable checkpoint.
- Repository governance defines branch, commit, pull-request, CI, security, remote-creation, and protection behavior without claiming unconfigured GitHub controls.
- All commands pass from a fresh repository checkout.

## Required evidence

Store the phase evidence index under `evidence/phase-00/` when implementation begins.

- tool versions
- CI run link or local equivalent
- complete check output
- documentation-link report
- architecture-rule failure demonstration
- clean-checkout bootstrap record
- engineering coverage, demo-contract, and repository-governance audit

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Application services
- Databases or local infrastructure
- GraphQL schema
- Media files
- Hosted deployment

## Exit gate

The phase is `VERIFIED` only when:

- every requirement has a linked implementation or documented non-applicability;
- all required tests pass from a clean environment;
- evidence is stored and reviewed;
- security, accessibility, failure, and operational effects are documented;
- no planned behavior is described as implemented;
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md` are current;
- the next phase prerequisites are explicitly checked.

## Learning outcomes

- Monorepo boundary enforcement
- Reproducible toolchains
- Quality-gate design
- Repository memory for automated work

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
