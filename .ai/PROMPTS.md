# Reusable Agent Prompts

These prompts assume the agent can read and modify the repository. Use one prompt at a time.

## Resume the project

```text
Read the root AGENTS.md, .ai/README.md, .ai/CONTEXT.md, .ai/CURRENT_STATE.md, .ai/WORK_QUEUE.md, .ai/HANDOFF.md, the active phase specification, referenced ADRs, relevant skills, and affected code/tests.

Reconstruct the current verified state from repository evidence. Do not rely on prior chat context. Report:
1. active phase and exact next work item;
2. prerequisites and blockers;
3. owner, invariants, trust boundaries, and failure modes;
4. required tests and evidence;
5. any inconsistency between state, documentation, and code.

Do not change files until the state is coherent.
```

## Implement the next work item

```text
Restore context according to AGENTS.md. Select only the earliest actionable READY item in .ai/WORK_QUEUE.md. An earlier WAITING_EXTERNAL item is allowed only when its exact frozen candidate and predecessor-first release condition are recorded. Confirm the selected item belongs to the active phase and its prerequisites are verified.

Populate .ai/CHANGE_PLAN.md from docs/templates/WORK_ITEM_TEMPLATE.md. Implement the smallest complete vertical slice. Preserve context boundaries, data ownership, security, cancellation, bounded resources, failure behavior, and observability.

Name the focused iteration gate, affected-scope candidate gate, heavyweight-evidence repeat triggers, and review stopping rule. Use focused checks during edits, `pnpm check:changed` for the coherent candidate, and the complete acceptance gate once stable. Collect a full review round, batch related remediation, and use one confirmation; extend review only for a changed or newly discovered blocking boundary.

Capture evidence at candidate and closeout checkpoints. Do not claim success without passing output. Update .ai/CURRENT_STATE.md, .ai/WORK_QUEUE.md, .ai/SESSION_LOG.md, .ai/HANDOFF.md, and relevant documentation before finishing.

Do not begin a second ambiguous work item. At most one dependent local item may proceed behind one conforming WAITING_EXTERNAL predecessor.
```

## Review a proposed change

```text
Read AGENTS.md, the active requirement, referenced ADRs, relevant skills, the complete changed files, and tests.

Review for:
- requirement traceability;
- bounded-context and data ownership violations;
- domain rules leaking into adapters;
- authorization and input validation;
- retry safety, deadlines, cancellation, and concurrency bounds;
- Redis authority and degraded behavior;
- GraphQL N+1, cost, pagination, and nullability;
- event idempotency, ordering, and schema compatibility;
- SSR hydration and state ownership;
- media rights, isolation, validation, and publication atomicity;
- telemetry privacy and cardinality;
- test quality, evidence, rollback, and documentation truth.

Report concrete findings ordered by severity with file and location. Do not approve based only on compilation.
```

## Investigate a failure

```text
Start from the affected user or operator journey and its SLI. Read the relevant runbook and recent change state.

Use metrics to establish scope and saturation, traces to locate the boundary, and logs for detailed stable error context. State facts separately from hypotheses. Prefer the safest reversible mitigation.

Preserve evidence, verify recovery against the user outcome, update the incident timeline, and leave unresolved uncertainty explicit. Do not make broad untested changes when rollback, isolation, traffic reduction, or a safe fallback is available.
```

## Run an experiment

```text
Use docs/templates/EXPERIMENT_TEMPLATE.md. Identify the decision, falsifiable hypothesis, controlled variables, environment, dataset, workload, functional assertions, raw evidence path, and limitations.

Establish a baseline. Change one meaningful variable. Run the same workload. Record result without inventing precision or generalizing beyond the tested range. Keep failed results.

Update the related requirement and .ai state only when the evidence supports a decision.
```

## Close a phase

```text
Read the complete active phase specification. Build a requirement-to-implementation-and-evidence matrix. Run every required quality gate from a clean environment.

Verify security, accessibility, failure behavior, operations, documentation links, migrations, schema composition, and status truth. Record remaining risks and deferred work in the correct future specification.

Mark the phase VERIFIED and CLOSED only when every exit condition passes. Update ROADMAP.md, .ai/CURRENT_STATE.md, .ai/WORK_QUEUE.md, .ai/SESSION_LOG.md, .ai/HANDOFF.md, and the evidence index.
```
