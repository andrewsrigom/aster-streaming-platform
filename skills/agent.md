# Skill: Repository Agent

## Purpose

Execute work in Aster without losing context, changing direction silently, or producing code that cannot be verified and operated.

## Activation

Use this skill for every repository task. Load additional skills according to the affected area.

## Execution loop

### Step 1 — Restore context

Read, in order:

1. `AGENTS.md`
2. `.ai/CONTEXT.md`
3. `.ai/CURRENT_STATE.md`
4. `.ai/WORK_QUEUE.md`
5. active phase specification
6. referenced ADRs
7. relevant specialized skills
8. affected code and tests

Summarize internally:

- active requirement;
- current behavior;
- desired behavior;
- data owner;
- trust boundaries;
- invariants;
- failure modes;
- evidence required.

Do not start implementation until these are consistent.

### Step 2 — Check phase eligibility

Ask:

- Does this work belong to the active phase?
- Are its prerequisites verified?
- Does it create a service, dependency, schema, infrastructure component, or abstraction not approved by the phase?
- Is an ADR required?
- Can a smaller vertical slice satisfy the requirement?

If the work belongs to a future phase, update that phase specification or queue rather than implementing it early.

### Step 3 — Write the change plan

Use `docs/templates/WORK_ITEM_TEMPLATE.md`.

A valid plan includes:

- requirement IDs;
- affected files;
- architecture boundaries;
- data and event changes;
- security impact;
- failure behavior;
- tests;
- evidence;
- rollback;
- documentation updates.

### Step 4 — Implement from the inside out

Preferred order:

1. domain rule;
2. application use case;
3. port or interface;
4. infrastructure adapter;
5. transport adapter;
6. telemetry;
7. tests at each necessary layer;
8. documentation.

Do not place domain rules in GraphQL resolvers, React components, ORM models, Redis scripts, or event handlers.

### Step 5 — Verify adverse behavior

For each dependency, verify:

- timeout;
- cancellation;
- unavailable response;
- malformed response;
- partial completion;
- retry safety;
- concurrent execution;
- duplicate delivery;
- stale ordering;
- graceful shutdown.

Not every test applies to every change, but exclusions must be reasoned.

### Step 6 — Capture evidence

Use `docs/templates/EXPERIMENT_TEMPLATE.md` for measurements. Evidence must include:

- environment;
- exact command;
- input or workload;
- result;
- raw artifact path;
- interpretation;
- limitations.

Never invent benchmark values.

### Step 7 — Update repository memory

Before finishing:

- update `.ai/CURRENT_STATE.md`;
- update `.ai/WORK_QUEUE.md`;
- append `.ai/SESSION_LOG.md`;
- update `.ai/DECISIONS_LEDGER.md` if needed;
- update `.ai/HANDOFF.md` if incomplete;
- update specifications and runbooks when behavior changed.

## Stop conditions

Stop implementation and create a proposal when:

- requirements conflict;
- data ownership is unclear;
- a security invariant cannot be preserved;
- a license is uncertain;
- a migration cannot be made safe;
- an external dependency lacks a deadline or cancellation path;
- required evidence cannot be obtained;
- a new architecture decision is necessary.

Stopping means documenting the blocker, not hiding it or bypassing it.

## Output standard

A useful agent output states:

- what changed;
- why it changed;
- requirements satisfied;
- tests and evidence;
- remaining risks;
- exact next action.

Avoid long narratives that do not help resume or verify the work.
