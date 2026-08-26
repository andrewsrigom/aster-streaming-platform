# Aster Agent Operating Contract

This file applies to every automated or human-assisted change in this repository. A more specific `AGENTS.md` may add local constraints, but it may not weaken this contract.

## 1. Mission

Build Aster as a coherent, production-oriented video-on-demand system whose behavior is traceable to written requirements, explicit decisions, tests, measurements, and operational documentation.

The goal is not to maximize the number of services, libraries, files, or patterns. The goal is to make each implemented capability understandable, correct, observable, recoverable, and proportionate to its requirements.

## 2. Required context restoration

Before proposing or changing code, read:

1. this file;
2. `.ai/CONTEXT.md`;
3. `.ai/CURRENT_STATE.md`;
4. `.ai/WORK_QUEUE.md`;
5. the active phase specification;
6. every architecture decision referenced by that phase;
7. the relevant skill files under `skills/`;
8. the existing tests and implementation in the affected area.

Do not rely on prior conversation context as the only source of truth.

## 3. Truthfulness rule

Never claim that a feature, benchmark, test, deployment, security control, dashboard, or runbook works unless current evidence proves it.

Use these labels consistently:

- **planned**: specified but not implemented;
- **implemented**: code exists and focused tests pass;
- **verified**: acceptance checks and required evidence pass;
- **released**: deployed through the documented release process.

Documentation must distinguish the target architecture from the current implementation.

## 4. Change protocol

For every non-trivial change:

1. identify the active requirement IDs;
2. state the affected bounded context and data owner;
3. identify trust boundaries and failure modes;
4. write or update `.ai/CHANGE_PLAN.md` using the template in `docs/templates/WORK_ITEM_TEMPLATE.md`;
5. implement the smallest complete slice;
6. run the required quality gates;
7. capture evidence;
8. update documentation and `.ai/CURRENT_STATE.md`;
9. append a concise entry to `.ai/SESSION_LOG.md`;
10. leave a precise handoff if the work is not complete.

Do not begin a second work item while the first is in an ambiguous state.

A coherent candidate may move to `WAITING_EXTERNAL` only when implementation, applicable local gates, evidence, exact head, and rollback are recorded and its sole remaining condition is named hosted CI, review, or merge state. This state is not ambiguous. At most one later item may become `IN_PROGRESS` on a branch based on that frozen head. The dependent item must not publish, merge, or release before the waiting predecessor. If the predecessor changes, rebase the dependent branch and repeat its affected gates before publication. Do not use this state for unresolved requirements, failed tests, open blocking findings, missing evidence, credentials, or owner decisions.

Verification is risk-proportionate and checkpoint-based:

- during implementation, run the cheapest focused test and static checks that can catch the changed behavior;
- before publishing a coherent candidate, run the affected-scope gate;
- before merge, run the complete acceptance gate required by the work item;
- repeat a clean checkout, container start, browser suite, media job, load test, or other heavyweight experiment only when a later change can invalidate that evidence;
- consolidate repository-memory and evidence prose at meaningful candidate and closeout checkpoints instead of rewriting it after every micro-edit.

A work item is sufficiently verified when its written requirements, acceptance behavior, named failure modes, and applicable security, data, availability, and public-contract boundaries pass. Verification does not require eliminating every conceivable defect before the next vertical slice.

Collect a complete review round before editing and batch related remediation. Use one initial review and one confirmation review. Start another review round only when a remediation changes a blocking boundary or a new finding violates a requirement, security or data invariant, availability behavior, or public contract. Record lower-risk speculative hardening in the correct future work rather than extending the current item indefinitely.

## 5. Scope control

An agent must not:

- add a new service when a module in an existing owner can satisfy the requirement;
- change a bounded-context boundary without an ADR;
- introduce a new database, broker, cache, framework, or deployment platform without an ADR;
- implement a future phase to work around unfinished current-phase requirements;
- create generalized abstractions before two concrete use cases exist;
- duplicate authoritative data across services without an explicit consistency model;
- move server state into Redux;
- make Redis the source of truth for durable product data;
- stream video bytes through application services when object storage and CDN delivery are intended;
- silently broaden product scope;
- leave dead scaffolding, fake integrations, placeholder dashboards, or invented metrics.

When a requested change conflicts with a current decision, stop and propose an ADR rather than bypassing the decision.

## 5.1 Autonomous execution policy

After context restoration, an agent may start the first `READY` work item without asking the repository owner to restate accepted requirements or architecture.

The agent may autonomously make a decision when it is:

- owned by the active phase;
- reversible without data or rights loss;
- inside the fixed technology and context boundaries;
- supported by current official documentation and compatibility evidence;
- recorded in the change plan with tests, evidence, and rollback.

Examples include exact supported tool versions, local package selection, file organization inside an accepted boundary, and focused test strategy.

The agent must stop for owner input or an ADR when a decision:

- changes a fixed architecture invariant, product scope, data owner, security trust model, or license;
- creates paid or hosted resources, mutates a public remote, or requires credentials;
- makes an irreversible migration or destructive production change;
- asserts media rights or attribution that current evidence does not prove;
- has two materially different product outcomes not resolved by written requirements.

A named safe default and resolution phase make a deferral explicit. Silence or convenience does not.

## 6. Architecture invariants

These invariants require an ADR to change:

- The five primary bounded contexts are Identity and Profiles, Catalog, Playback, Engagement, and Discovery.
- Each context owns its writes and persistence model.
- Cross-context reads use the federated API or explicit read models.
- Cross-context state propagation uses versioned events with idempotent consumers.
- The GraphQL supergraph is the public application API.
- PostgreSQL is the durable system of record.
- Redis is non-authoritative and must have a defined degraded mode.
- Media originals and renditions live in object storage.
- Clients consume media through a CDN-compatible URL.
- Domain and application layers do not import web frameworks, database clients, Redis clients, or telemetry SDKs.
- Every outbound network operation has a deadline and cancellation path.
- Retries are limited to operations known to be safe or made safe through idempotency.
- DataLoader instances are request-scoped.
- Apollo Client owns remote GraphQL state; Redux owns complex local interaction state.
- Rights verification is required before media publication.
- Creative Commons media must not be wrapped in incompatible access restrictions.

## 7. Implementation quality

Code must:

- use strict TypeScript;
- use explicit domain vocabulary;
- validate input at trust boundaries;
- propagate `AbortSignal` where work can outlive a request;
- bound concurrency, collection size, pagination, queues, and caches;
- handle process termination with graceful shutdown;
- produce structured logs with trace correlation;
- expose relevant metrics without high-cardinality labels;
- avoid logging tokens, cookies, passwords, personal data, or signed media URLs;
- use deterministic clocks and identifiers in tests where ordering matters;
- keep comments focused on rationale, invariants, unusual failure behavior, or external constraints.

Do not write comments that merely restate the code.

## 8. Testing and evidence

A change is not complete because it compiles.

Depending on risk, evidence may include:

- unit tests for domain rules;
- integration tests against real PostgreSQL and Redis containers;
- GraphQL schema composition checks;
- contract tests for events;
- browser tests for user journeys;
- load-test reports;
- trace screenshots or exported traces;
- metric queries;
- heap snapshots;
- flame graphs;
- accessibility reports;
- failure-injection results;
- migration forward-and-backward checks.

Use measured values only. Keep raw evidence under `evidence/` when implementation begins and link it from the relevant document.

The active change plan must name its iteration gate, candidate gate, heavyweight-evidence repeat triggers, and review stopping rule. A previously passing heavyweight result remains supporting evidence when later changes cannot affect the behavior it measured and the exact later source still passes its applicable local and protected gates; document that reasoning explicitly.

## 9. Security rules

- Treat the browser, uploaded metadata, tokens, webhooks, event payloads, and media manifests as untrusted input.
- Enforce authorization in the owning service, not only in the UI or router.
- Apply operation allowlisting or persisted operations in hosted environments.
- Limit GraphQL depth, aliases, list sizes, cost, request body size, concurrency, and execution time.
- Verify media type from content, not filename alone.
- Run media processing in an isolated, resource-limited worker.
- Never commit secrets or production credentials.
- Never use real personal data in fixtures, logs, screenshots, or examples.

Read `SECURITY.md` and `skills/security.md` before security-sensitive work.

## 10. Media and licensing rules

Before downloading or processing a title:

1. record the canonical source page;
2. record the direct asset source;
3. record creator and copyright holder;
4. record the exact license name, version, and URL;
5. record required attribution;
6. record whether modifications are allowed;
7. record whether commercial use is allowed;
8. record any trademark or third-party asset caveats;
9. save a rights-review date and reviewer;
10. generate the public attribution entry.

A title without a completed rights record cannot enter the publish state.

## 11. Documentation maintenance

Update documentation in the same change when behavior, contracts, ownership, operational procedures, or assumptions change.

Use present tense only for implemented behavior. Use “will” or “planned” for future behavior.

Architecture diagrams must match prose and code. Broken internal links are release blockers.

## 12. Context retention

At the end of a work session:

- update `.ai/CURRENT_STATE.md`;
- update `.ai/WORK_QUEUE.md`;
- append to `.ai/SESSION_LOG.md`;
- update `.ai/DECISIONS_LEDGER.md` if a decision changed;
- write `.ai/HANDOFF.md` when work remains;
- list commands run and their outcomes;
- identify unresolved risks without hiding them.

The next agent must be able to continue from repository files alone.

## 13. Specialized skills

Load the relevant files before work:

- `skills/product.md`
- `skills/architecture.md`
- `skills/node-runtime.md`
- `skills/graphql-federation.md`
- `skills/redis.md`
- `skills/resilience.md`
- `skills/observability.md`
- `skills/frontend.md`
- `skills/media-streaming.md`
- `skills/data-events.md`
- `skills/security.md`
- `skills/testing.md`
- `skills/system-design.md`
- `skills/release-operations.md`
- `skills/documentation.md`

`skills/agent.md` contains the detailed execution loop.
