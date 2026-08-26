# Repository Memory

The `.ai/` directory is durable execution state. It is designed so a new contributor or automated agent can resume work without relying on private conversation history.

## Files

### `CONTEXT.md`

Stable product, architecture, and technology context. Change only when an accepted decision changes the baseline.

### `CURRENT_STATE.md`

What is verified, what is not implemented, active phase, next outcome, and known risks.

### `WORK_QUEUE.md`

Ordered phase-scoped work. Only one item may be in progress. One earlier frozen candidate may be `WAITING_EXTERNAL` while one dependent local item proceeds under the recorded predecessor-first release rule.

### `CHANGE_PLAN.md`

The active work item's detailed plan. Reset only after completion or documented abandonment.

### `DECISIONS_LEDGER.md`

Navigation to accepted ADRs and unresolved decisions. ADR files remain authoritative.

### `SESSION_LOG.md`

Append-only concise record of completed work, evidence, and next action.

### `HANDOFF.md`

Exact resume point when work is incomplete.

### `QUALITY_GATES.md`

Required checks by risk and release stage.

### `PROMPTS.md`

Reusable instructions for resuming, implementing, reviewing, investigating, and closing a phase.

## Update rules

At work start:

1. restore context;
2. move the earliest actionable queue item to `IN_PROGRESS`; an earlier `WAITING_EXTERNAL` item is allowed only under the frozen-candidate policy in `AGENTS.md`;
3. populate `CHANGE_PLAN.md`.

At work end:

1. update current state;
2. update queue;
3. append session log;
4. update decisions if needed;
5. write handoff;
6. record commands and evidence.

## State quality

State files must be:

- factual;
- concise;
- current;
- free of invented completion;
- sufficient to identify the exact next action;
- safe to keep public.

Do not use `.ai/` as a scratch dump. Temporary reasoning belongs outside committed project state.

## Executable validation

Run `pnpm ai:check` for the bounded static contract and `pnpm ai:test` for its adverse fixtures. The validator requires the durable memory files as regular bounded UTF-8 inputs; checks queue order, statuses, one external wait, active-item uniqueness, and live blocker references; binds the active, first ready, or waiting requirement to the change plan, current-state next outcome, and handoff; and checks reverse-chronological session entry structure.

This gate proves explicit structure and cross-file consistency. It cannot prove that arbitrary narrative statements are semantically true, so evidence review and the truthfulness rule in `AGENTS.md` still apply. The commands run in `pnpm check` and the dependency-free CI governance job, not in the fast staged-file commit hook.
