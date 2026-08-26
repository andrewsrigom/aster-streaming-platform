# Repository Memory

The `.ai/` directory is durable execution state. It is designed so a new contributor or automated agent can resume work without relying on private conversation history.

## Files

### `CONTEXT.md`

Stable product, architecture, and technology context. Change only when an accepted decision changes the baseline.

### `CURRENT_STATE.md`

What is verified, what is not implemented, active phase, next outcome, and known risks.

### `WORK_QUEUE.md`

Ordered phase-scoped work. Only one item may be in progress.

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
2. move one queue item to `IN_PROGRESS`;
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
