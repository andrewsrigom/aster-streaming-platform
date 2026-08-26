# Contributing

Aster uses specification-driven delivery. Every code change must be connected to an active requirement, architecture decision, defect, experiment, or operational need.

## Before starting

Read `AGENTS.md`, `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, the active phase specification, and relevant skills.

Create or update `.ai/CHANGE_PLAN.md` for work that changes behavior, contracts, persistence, architecture, security, reliability, or operations.

## Contribution licensing

By submitting a contribution, you confirm that it is original or that you have sufficient permission to submit it, and you provide it under the repository's [MIT License](LICENSE). Do not submit third-party code, media, artwork, fonts, credentials, personal data, or generated assets unless their provenance and compatible licensing are documented.

Media contributions additionally require the rights record defined in `docs/product/CONTENT_RIGHTS.md`; the repository's MIT License does not override media-specific terms.

## Branch and change scope

Keep one coherent outcome per branch. A branch should be explainable as one sentence and verifiable with one acceptance path.

When a Jira key exists, use that exact key as the branch name. Otherwise use `<type>/<short-kebab-description>`. Branch names beginning with `codex/` are prohibited. See [`docs/operations/REPOSITORY_GOVERNANCE.md`](docs/operations/REPOSITORY_GOVERNANCE.md) for the authoritative branch and merge policy.

Avoid combining:

- refactoring and behavior changes without a clear reason;
- dependency upgrades and feature work;
- schema changes and unrelated UI work;
- broad formatting changes and functional changes.

## Commit messages

Atomic means a coherent, reversible outcome, not a commit for every file or mechanical step. Keep related implementation, tests, evidence, and documentation together when they form one reviewable result. Commit count is not a quality metric.

Use a Conventional Commit-shaped imperative subject:

```text
feat(catalog): add keyset pagination for title search
fix(playback): reject stale progress updates
perf(router): enforce operation cost budget
feat(media): publish HLS manifest atomically
```

The body should explain why the change exists, relevant requirement IDs, and important trade-offs when they are not obvious from the diff.

The project uses squash merge so `main` receives one coherent commit per pull request. Intermediate branch commits may be reorganized before review.

## Feedback and quality gates

Do not run the entire repository, integration, browser, media, or load suite on every commit.

- Commit hooks inspect only commit metadata and changed files with fast formatting, lint, and secret checks.
- Before push, run the affected formatting, lint, type, unit, and documentation checks.
- For `infra/compose/` changes, run `pnpm platform:check`, `pnpm platform:test`, `pnpm platform:compose:check`, and the documented Docker-only checkpoint in a unique project.
- A ready-for-review pull request runs the authoritative path-aware CI gate.
- Phase and release gates run clean installs, containers, browser, media, failure, load, soak, and other heavyweight evidence required by their specification.
- Superseded pull-request runs are cancelled, and branch pushes do not duplicate the full pull-request pipeline for the same revision.

CI remains authoritative when a local diagnostic bypass is necessary. New mandatory checks require a measured feedback cost and a failure class that justifies their tier.

## Pull request expectations

A change should state:

- linked requirement or defect;
- affected context and owner;
- user-visible behavior;
- failure behavior;
- security and privacy impact;
- data migration impact;
- observability changes;
- tests and evidence;
- rollback path;
- documentation updates.

The active [pull-request template](.github/PULL_REQUEST_TEMPLATE.md) requests these fields and the contribution declaration. Use a Conventional Commit-shaped pull-request title because the repository squash-merges one coherent result to `main`; title enforcement remains a review responsibility until the hosted repository gate proves otherwise.

Draft pull requests may be used without running the complete merge gate. Mark the pull request ready when its coherent work item is ready for authoritative validation.

## Reporting bugs and proposing changes

Use the structured [bug report](.github/ISSUE_TEMPLATE/bug-report.md) for reproducible incorrect behavior and the [change proposal](.github/ISSUE_TEMPLATE/change-proposal.md) for one bounded product, architecture, reliability, security, or operational outcome. Search existing issues first and remove credentials, tokens, personal data, private exploit details, and unrestricted signed media URLs from logs, screenshots, traces, or reproduction data.

Do not report a vulnerability through a public issue. Follow [`SECURITY.md`](SECURITY.md). Private vulnerability reporting and hosted template rendering are verified only after the public repository is created and its settings are audited.

## Review checklist

Reviewers verify:

- the change respects context boundaries;
- authoritative data has one owner;
- concurrency and ordering are explicit;
- network calls are bounded and cancellable;
- retries are safe;
- error handling preserves useful context;
- logs are structured and sanitized;
- metrics avoid unbounded labels;
- tests cover invariants and failure behavior;
- documentation describes reality;
- no speculative abstraction or unused scaffolding was added.

## Definition of done

A change is complete only when all active acceptance criteria pass, required evidence exists, documentation is current, and the repository can be resumed from `.ai/` state files without private context.
