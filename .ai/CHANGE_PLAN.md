# Work Item: Implement Runtime Lifecycle, Health, and Bounded Graceful Shutdown

- Status: IN_PROGRESS
- Owner: Aster shared runtime infrastructure
- Phase: 01
- Requirement IDs: P01-R05
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

Provide one reusable Node.js lifecycle coordinator that makes startup, liveness, readiness, process-signal ownership, ordered resource closure, bounded in-flight drain, and forced termination explicit. Later services adopt this runtime behavior without copying signal handlers or inventing competing shutdown budgets.

## Current behavior

`@aster/runtime` provides structured logging with redaction and trace correlation. `@aster/http-express` provides a bounded Express request listener, request-local cancellation, and an Apollo compatibility test that drains one synthetic in-flight operation. No package currently owns process signals, startup/readiness transitions, generalized in-flight tracking, dependency closure order, one overall shutdown deadline, timeout logging, or forced termination.

P00-R06 is released through protected squash `92d3531`, and post-merge run `32999467446` passes. This P01-R05 branch has been rebased from predecessor head `dd9f282` onto released `main`; focused real-socket/process evidence and the affected gate must repeat before publication.

## Proposed behavior

Add a transport-neutral lifecycle state machine to `@aster/runtime`. A process begins `starting` and not ready, explicitly becomes `ready`, becomes `failed` on unrecoverable startup failure, and enters `draining` before it becomes `stopped`. Liveness and readiness snapshots expose only stable state and bounded reason codes.

Use one idempotent shutdown promise and one overall deadline. The coordinator first fails readiness and stops new traffic, then drains in-flight work, stops consumers, flushes telemetry, and closes dependencies within the remaining budget. Every asynchronous hook receives the same cancellation signal. A rejection is classified without reflecting its raw error. Deadline exhaustion invokes the global force-close path. A rejected resource-closing stage invokes that path immediately and prevents later graceful stages from starting, so a failed consumer cannot continue against dependencies being closed; an isolated telemetry-flush rejection continues to dependency closure and remains degraded because that later stage owns exporter resources.

Add one explicit process-signal binding for `SIGINT` and `SIGTERM`. The first signal begins graceful shutdown; a repeated signal requests immediate force-close. Signal handlers are removable and do not compete with transport-owned handlers. Graceful and successful forced completion let the event loop exit naturally; if the composition-wide force-close path throws or lifecycle coordination rejects, the signal owner disposes its handlers and uses the signal's conventional status as a last-resort hard process exit so a leaked handle cannot defeat bounded termination. Add a concrete Node.js HTTP server seam that calls `server.close()` before any forced `server.closeAllConnections()`, preserving the documented race-free order. Express and Apollo types remain inside their existing adapter package.

## Boundaries

- Owning context: Shared runtime infrastructure; no product bounded context or durable data owner changes.
- Affected packages: `@aster/runtime`, its tests and diagnostic; `@aster/http-express` only if a narrow Node HTTP lifecycle compatibility seam is required; runtime and operations documentation; Phase 01 evidence and repository memory.
- Authoritative data: In-memory lifecycle state owned by the current process. It is ephemeral and non-authoritative for product data.
- Trust boundaries: Constructor options, lifecycle transitions, registered asynchronous hooks, Node.js process signals, HTTP server events and sockets, timers, injected log destinations, and caller cancellation behavior.
- External dependencies: Node.js `24.19.0` built-ins and existing `@aster/runtime` logging. No new package, service, database, Redis key, broker, container, or hosted resource.

## Invariants

- Exactly one coordinator owns process lifecycle and signal bindings in a service process.
- Readiness becomes false before new traffic is stopped or resources are closed.
- Liveness describes whether the process can coordinate lifecycle; readiness describes whether it can accept its responsibility.
- State transitions are monotonic; a draining, stopped, or failed process cannot become ready.
- Shutdown is idempotent and concurrent callers observe the same terminal outcome.
- All graceful work shares one overall deadline and cancellation signal; nested hooks cannot create a new unbounded budget.
- HTTP force-close follows `server.close()` and occurs only after deadline exhaustion or an explicit repeated signal.
- Raw hook errors, configuration values, request data, tokens, URLs, and internal topology never appear in health output or lifecycle logs.
- Logging or telemetry failure cannot extend shutdown beyond its deadline.
- Domain and application packages import no Node.js HTTP, process, Express, Apollo, database, Redis, or telemetry SDK types.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Missing, accessor-backed, excessive, or invalid lifecycle options | Fail construction with one bounded cause-free issue set before signal or timer registration | Sanitized construction error only |
| Invalid or repeated startup transition | Reject with a stable transition result; never move backward or become ready after drain/failure | Stable state and transition code |
| Startup marked failed | Remain not ready, report bounded startup-failed health, and allow cleanup | Structured lifecycle event without raw cause |
| First `SIGINT` or `SIGTERM` | Fail readiness and begin the shared graceful-shutdown promise once | Signal category and lifecycle phase |
| Concurrent shutdown calls | Return the same terminal work and do not repeat hooks | One shutdown-start event |
| Repeated termination signal | Abort remaining graceful work, call force-close once, and produce a forced outcome | Stable repeated-signal event |
| Traffic, consumer, or dependency close rejects | Classify the stage, invoke global force-close once with `stage_failure`, do not start later graceful stages, and return a forced outcome | Stage name and bounded force reason; no raw error |
| Telemetry flush rejects | Classify the stage, continue dependency closure, and return a degraded outcome when no resource-closing stage fails | Stage name and bounded outcome; no raw error |
| Hook ignores cancellation or never settles | Deadline wins through a deterministic race; force-close runs and the coordinator returns without awaiting the hook forever | Deadline and forced outcome |
| Force-close throws or returns any value/thenable under signal-owned shutdown | Attempt the synchronous callback, classify `force_close`, absorb any returned Promise rejection, dispose signal handlers, and hard-exit with the first signal's conventional status | Stable force-close failure category before terminal fallback |
| Lifecycle coordination rejects under signal-owned shutdown | Dispose signal handlers and hard-exit with the first signal's conventional status | No raw error or rejected value |
| Logger or telemetry sink fails | Continue lifecycle and deadline enforcement | Existing logger write result only |
| HTTP server receives shutdown | Call `server.close()` to stop accepts and drain active HTTP before force-close is eligible | Server drain outcome |

## Data and contracts

- Schema/migration: None.
- GraphQL/events: None. Apollo drain compatibility remains in `@aster/http-express` and composes with the single lifecycle coordinator.
- Cache: None.
- Public runtime API: Frozen lifecycle state, bounded health snapshot, explicit readiness/startup transitions, idempotent shutdown, signal binding with disposal, and narrow lifecycle hook types.
- Compatibility: No change to the existing logger or Express request-listener contract. New declarations must expose no Express, Apollo, Pino, database, Redis, broker, or telemetry SDK types.
- Retention/deletion: Lifecycle state and hook references are process-local and released after terminal completion/disposal.

## Security and privacy

- Actors: Local service composition root, orchestrator signals, HTTP clients observing future health routes, and resource adapters participating in shutdown.
- Assets: Service availability, bounded termination, request completion, log confidentiality, and dependency integrity.
- Controls: Fail-closed option validation, monotonic state, one signal owner, stable health reason codes, bounded hook inventory, one deadline, cancellation, error sanitization, and forced close.
- Health snapshots expose no hostname, port, dependency URL, credential, exception, stack, request identifier, or signed media URL.
- Authorization is not added; future public health routing must preserve the stable non-sensitive contract and deployment ownership.

## Implementation steps

1. Add strict lifecycle state, health snapshot, option normalization, transition errors, and deterministic tests inside `@aster/runtime`.
2. Add one shared shutdown promise, fixed ordered hook stages, one deadline/cancellation signal, bounded failure classification, and one idempotent force-close path.
3. Add removable `SIGINT`/`SIGTERM` binding with first-signal graceful and repeated-signal force behavior.
4. Add a concrete Node.js HTTP drain seam and real-socket tests for new-traffic refusal, in-flight completion, and forced deadline closure.
5. Integrate stable lifecycle events with the existing runtime logger without allowing sink failure to block termination.
6. Update runtime/HTTP operations documentation, Phase 01 evidence, state, and handoff; run affected, complete, protected, and bounded review gates after the predecessor is released and this branch is rebased.

## Tests

- State: Initial startup health, ready transition, startup failure, monotonic invalid transitions, frozen snapshots, hostile option accessors, and bounded issues.
- Shutdown: Exact stage order, one shared promise, concurrent calls, immediate resource-closing rejection force behavior without later stage execution, telemetry-only degradation through dependency closure, ignored cancellation, one overall deadline, force-close once, and terminal outcome.
- Signals: First signal begins graceful work, repeated signal forces, handlers dispose, conventional categories remain stable without installing duplicate owners, and a deterministic plus real-process diagnostic prove the hard fallback when force close fails.
- HTTP integration: `server.close()` precedes force-close, a request already in flight can finish within budget, new connections fail after drain begins, and a stuck request is closed at deadline.
- Logging/security: Lifecycle events contain only stable fields; raw errors and canaries are absent; logger failure does not change state or deadline behavior.
- Contract: Generated declarations contain no Express, Apollo, Pino, PostgreSQL, Redis, broker, or telemetry SDK types.
- Process: A spawned diagnostic handles a real termination signal where the host supports it, exits within the bound, and leaves no listener or child work behind.

## Evidence

- Raw artifact path: `evidence/phase-01/runtime-lifecycle.txt`.
- Acceptance result: Rebased focused lifecycle and affected gates pass; the earlier clean checkout remains applicable for unchanged bootstrap and packaging behavior. Protected runs `33000352054`, `33001670494`, and `33002748501` pass. Initial review discussion `3865708507` found that a rejected resource-closing hook could release the only deadline without releasing a live handle. Remediation `6b9acb2` force-closed after remaining eligible stages; confirmation discussion `3865804838` then found that a failed consumer could still run against dependency teardown during that interval. Immediate-force remediation `fe61fc4` passed its local and protected gates. Availability-boundary confirmation discussion `3865880765` then found that a throwing force-close callback still lacked a hard process-termination fallback. Signal hard-fallback remediation `fc44892` plus exact focused 39-test, 15-task affected, documentation, memory, security, and audit gates pass; protected CI, discussion resolution, final boundary confirmation, merge, and post-merge evidence remain pending.
- Planning-only runway artifact: `evidence/phase-01/runtime-runway-preflight.txt`; its documentation, memory, formatting, secret, whitespace, and affected 31-task gate pass without invalidating lifecycle source or heavyweight evidence.
- Iteration gate: Focused lifecycle build/test, package typecheck, targeted lint/format, and deterministic deadline/signal fixtures.
- Candidate gate: `pnpm check:changed` after one coherent lifecycle slice; one complete `pnpm check --force` plus high-severity audit when the candidate stabilizes.
- Heavyweight repeat triggers: Repeat a clean checkout only for dependency, lockfile, bootstrap, packaging, generated-declaration, or documented public-command changes. Repeat real socket/process evidence when lifecycle, signal, timer, HTTP drain, or force-close behavior changes. Docker is not required unless this item changes the existing local demonstration path.
- Review stopping rule: One complete review and one confirmation after rebase onto released `main`. Additional review only if remediation changes or reveals a requirement, security/data invariant, availability behavior, or public runtime/health contract.

## Rollback or recovery

Remove the lifecycle module, exports, tests, diagnostic, and documentation, leaving the existing logger and Express adapter contracts unchanged. Dispose installed signal handlers before replacing a coordinator. No data migration, cache invalidation, Docker cleanup, dependency rollback, or hosted action is required.

## Documentation updates

- Document lifecycle state, stable health meaning, shutdown order, signal behavior, overall deadline, failure classification, and force-close recovery.
- Clarify composition with the existing Express/Apollo drain and preserve P01-R08 ownership of dependency/startup deadlines plus P01-R06 ownership of process metrics.
- Preserve future-item separation through the planned P01-R06–R10 runtime runway; candidate research may narrow risks but must not install dependencies, create containers, change accepted contracts, or claim a later requirement is active.
- Record raw focused, real-socket/process, affected, complete, protected, and review evidence under Phase 01.
- Update `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md` at candidate and closeout checkpoints.

## Planning preparation boundary

The current lifecycle implementation remains the only active Phase 01 work item. Planning defines the ordered P01-R06 through P01-R10 paths, metric dimensions, adapter responsibilities, selection gates, failure matrices, profiles, and tests without activating them. This preparation creates no second active work item, changes no lifecycle source, installs no repository dependency, starts no new container, publishes no candidate, and resolves no pending client or image decision. `docs/architecture/RUNTIME_PLATFORM_RUNWAY.md` and `evidence/phase-01/runtime-runway-preflight.txt` record that boundary.

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
