# Work Item: Calibrate Risk-Proportionate Verification and Affected-Scope Feedback

- Status: IN_PROGRESS
- Owner: Aster repository engineering system
- Phase: 00
- Requirement IDs: P00-R06
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

Make the existing tiered-feedback policy executable and bounded: development iterations use focused tests, coherent candidates use affected-scope checks, pull requests use one authoritative protected gate, and heavyweight clean-start evidence repeats only when a later change can invalidate it. Define a review stopping rule that fixes requirement, security, data, availability, and public-contract findings while recording lower-risk speculative hardening instead of creating an unbounded review loop.

## Current behavior

Repository governance already prohibits full gates on every commit and describes `check:changed` as the pre-push path, but the root manifest exposes no such command. The full and source gates are executable, while review cadence, evidence consolidation, clean-checkout repetition triggers, and sufficient-verification criteria are not explicit. P01-R11 therefore accumulated fourteen branch commits and repeated full, clean-checkout, hosted-CI, review, and evidence cycles for progressively narrower transport cases before its final release at `93147ac`.

## Proposed behavior

Add one repository-owned quality-gate runner used by both `pnpm check` and `pnpm check:changed`. Full mode preserves the existing authoritative task graph. Changed mode invokes the same task set through pinned Turborepo affected execution with repository-fixed `main` and `HEAD` comparison refs and task-input-aware selection. Update the written contract so work items declare iteration, candidate, heavyweight-repeat, and review stopping rules before implementation; consolidate evidence at meaningful checkpoints; batch review remediation; and stop after one review plus one confirmation unless a later finding violates a named blocking boundary.

## Boundaries

- Owning context: Repository engineering system; no product bounded context or data owner changes.
- Affected services/packages: Root scripts, Turborepo task inputs, repository-tool tests, agent/governance/quality/local-development documentation, templates, and repository memory. No application package behavior changes.
- Authoritative data: Git history and repository files remain authoritative; Turbo cache output is derived and disposable.
- Read models/caches: Local Turborepo cache only; no remote cache or durable product state.
- Trust boundaries: Command-line arguments, inherited environment variables, Git comparison refs, changed paths interpreted by pinned Turborepo, child-process exit status, and documentation claims about executable commands.
- External dependencies: Existing exact-pinned Turborepo `2.10.12`, Node.js `24.19.0`, and pnpm `11.24.0`; no dependency addition.

## Invariants

- `pnpm check` retains the complete authoritative task list and behavior.
- `pnpm check:changed` uses the same task list and can only narrow task selection through the pinned Turbo affected mechanism.
- Caller-provided `TURBO_SCM_BASE` or `TURBO_SCM_HEAD` cannot silently narrow the repository-owned comparison.
- Root tasks responsible for package source, documentation, repository memory, security, CI, or platform policy declare inputs that select them when their owned files change.
- A missing comparison ref fails safe through Turbo behavior; a failed selected task propagates a nonzero exit.
- No rule permits skipping a requirement, security boundary, data invariant, availability contract, or public observable contract.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Unknown runner argument | Exit nonzero with one bounded usage error before Turbo | Terminal error only |
| Caller injects SCM base/head variables | Runner overwrites them with repository-owned refs | Test assertion; no secret values printed |
| Base history cannot be resolved | Turbo fails safe to conservative execution or returns nonzero; never report a false pass | Turbo diagnostic and process exit |
| Selected quality task fails | Preserve its nonzero status | Existing task output |
| Clean tree has no affected task | Exit zero with Turbo's empty affected result | Turbo summary |
| Documentation-only change | Select documentation, repository-memory when applicable, and security checks without package builds | Turbo dry-run and measured execution |
| Package-source change | Select the changed package and dependent build/test/type tasks plus owned root lint/format/unused/architecture/security tasks | Turbo dry-run and focused execution |

## Data and contracts

- Schema/migration: None.
- GraphQL: None.
- Events: None.
- Cache: Existing `.turbo` cache remains derived and removable.
- Compatibility: Existing `pnpm check` remains public and complete; `pnpm check:changed` becomes the documented pre-push interface.
- Retention/deletion: No new retained data. Existing cleanup continues to remove `.turbo` safely.

## Security and privacy

- Authorization: Not applicable; the command acts only on the local checkout.
- Input limits: Accept only the named changed-mode flag internally; fixed task list and SCM refs; bounded child-process lifetime belongs to the existing local execution environment.
- Sensitive data: Do not print inherited environment values, Git credential configuration, or file contents.
- Abuse cases: Environment override that narrows the diff, task-list drift between full and changed mode, missing history, changed files outside task inputs, command injection through arguments, and a child failure reported as success.

## Implementation steps

1. Add a typed quality-gate runner with one canonical task list, full and changed invocation construction, fixed SCM refs for changed mode, and exact exit propagation.
2. Wire `check` and `check:changed` to that runner and add focused unit/manifest contract tests to the existing toolchain test tier.
3. Enable task-input-aware affected execution and fill input gaps for root lint and security ownership.
4. Run dry and real affected checks against documentation and package-source fixtures without leaving synthetic changes in the final tree.
5. Update the operating contract, agent loop, governance, delivery model, quality gates, local development, reusable prompt, and work-item template with the calibrated cadence and stopping rules.
6. Run focused tests, changed-mode evidence, the full candidate gate, audit, clean public checkout only if bootstrap or public command behavior requires it, protected CI, and bounded review.

## Tests

- Domain: Not applicable.
- Application: Not applicable.
- Integration: Spawn the pinned Turbo CLI through injected process boundaries only where needed; exercise the real `check:changed` command on the current branch.
- Contract: Canonical task-list parity, exact full/changed arguments, fixed SCM refs, unknown-argument rejection, exit propagation, manifest scripts, Turbo future flag, and owned root task inputs.
- Browser: Not applicable.
- Performance/failure: Compare task selection and elapsed time for a documentation/repository-memory change and a representative package-source change; treat results as workflow observations, not general benchmarks.

## Evidence

- Commands: Focused runner tests, affected dry runs, real `pnpm check:changed`, `pnpm check --force`, documentation/repository-memory/security checks, high-severity audit, and protected CI.
- Raw artifact path: `evidence/phase-00/risk-proportionate-verification.txt`.
- Acceptance result: Pending.
- Iteration gate: Runner tests, typecheck/lint/format for changed tooling, and documentation/repository-memory checks for policy edits.
- Candidate gate: One complete forced graph plus audit after behavior and documentation stabilize.
- Heavyweight repeat triggers: Repeat clean checkout only after dependency, lockfile, bootstrap, packaging, Docker, generated-artifact, or documented public-command changes that can invalidate prior clean-start evidence. This work changes a public command, so one final clean checkout is required.
- Review stopping rule: One initial review and one confirmation. Additional review is justified only when a remediation changes a blocking boundary or a new finding violates a requirement, security/data invariant, availability behavior, or public contract.

## Rollback or recovery

Restore the direct `pnpm check` Turbo command, remove `check:changed`, the runner and its tests, remove task-input-aware affected configuration, and revert the policy text. No application, dependency, container, hosted resource, or durable data requires migration or cleanup.

## Documentation updates

- Calibrate `AGENTS.md` and `skills/agent.md` with sufficient-verification, review, batching, and evidence-checkpoint rules.
- Align the delivery model, repository governance, quality gates, local-development commands, reusable implementation prompt, and work-item template.
- Record measured command behavior in the Phase 00 corrective evidence and repository memory.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
