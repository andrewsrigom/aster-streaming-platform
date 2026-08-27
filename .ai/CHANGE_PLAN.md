# Work Item: Compose Deadlines, Readiness, Health, and the Identity Runtime Skeleton

- Status: IN_PROGRESS
- Owner: Aster shared runtime infrastructure and the Identity and Profiles reference composition root
- Phase: 01
- Requirement IDs: P01-R08
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

Provide one product-empty Identity reference process that starts and stops within finite budgets, exposes stable liveness and readiness routes, reports critical dependency failure without topology disclosure, recovers readiness through one bounded PostgreSQL/Redis monitor, rejects new tracked work while not ready, and composes the already released configuration, logging, HTTP, lifecycle, telemetry, clock, ID, PostgreSQL, and Redis boundaries without adding account, profile, session, GraphQL, schema, migration, cache, or event behavior.

## Current behavior

P01-R05 and P01-R06 released bounded lifecycle and telemetry. P01-R07 released the clock, ID, PostgreSQL, Redis, Kafka, and S3 adapter boundaries through corrective squash `61226eb3ce4976e31edde1f8b8198bcdd10095a6`; exact post-merge run `33026799005` passed. P01-R08 is now directly based on released `main`.

The deadline, dependency-readiness controller, recovery monitor, fixed health routes, and reference listener/startup configuration are implemented locally. No deployable service, service startup coordinator, product schema, or GraphQL resolver exists yet.

## Proposed behavior

Add a dependency-free deadline primitive to `@aster/runtime` that combines a finite monotonic timeout with an optional parent `AbortSignal`, exposes only the derived signal and remaining budget, and releases listeners/timers idempotently. Add a finite readiness controller that combines lifecycle phase with bounded critical-dependency states and delegates in-flight leases only while overall readiness is ready. Add one monitor that performs at most one probe per declared critical dependency, never overlaps monitor cycles, uses a finite jittered interval, accepts cancellation, and stops before dependency closure.

Extend `@aster/http-express` with fixed `GET`/`HEAD` `/health/live` and `/health/ready` routes backed by a repository-owned snapshot provider. Both routes emit the same bounded snapshot containing only liveness, readiness, lifecycle phase, and stable reason; HTTP status reflects the route's liveness or readiness decision, responses are non-cacheable, and health requests perform no dependency I/O. Keep the existing strict `/graphql` boundary and its unmounted `503` behavior unchanged.

Create `services/identity` as the first composition root. It validates reference configuration, creates logger/telemetry/runtime/transport/dependency owners, starts the HTTP health surface, performs one PostgreSQL and Redis startup attempt inside the propagated startup deadline, marks readiness from those two critical gates, starts the single recovery monitor, binds one lifecycle/signal owner, and closes monitor, telemetry, and dependencies in the existing shutdown order. It contains no Identity product use case and does not mount GraphQL.

Correct the repository task graph so every package `typecheck` waits for dependency builds as well as dependency typechecks. Add a policy regression for the exact edge. Do not change adapter runtime source, dependencies, lockfile, public contracts, or quality-gate scope.

## Boundaries

- Owning context: Shared runtime infrastructure owns deadline/readiness/monitor contracts; Identity and Profiles owns only the reference composition root and no product behavior or data.
- Affected services/packages: `@aster/runtime`, `@aster/http-express`, `@aster/config` only for the minimum reference listener/startup settings proven necessary, new `services/identity`, workspace tasks/tests, ADR-0011 wording, lifecycle/HTTP/configuration operations docs, Phase 01 runway/evidence, and repository memory.
- Authoritative data: None created. PostgreSQL remains the future durable authority; Redis remains non-authoritative; startup probes perform no durable write.
- Read models/caches: None.
- Trust boundaries: Process environment, listener host/port, startup and operation budgets, parent/caller signals, timer/scheduler/random providers, dependency probe outcomes and exceptions, health snapshot providers, HTTP methods/routes, concurrent monitor/start/stop calls, process signals, and partial construction/shutdown.
- External dependencies: Only the exact dependencies already selected by P01-R03 through P01-R07. No new registry package, container, hosted service, broker, object-storage runtime, Collector, or GraphQL dependency is added.

## Invariants

- Domain and application packages import no runtime, HTTP, PostgreSQL, Redis, or telemetry infrastructure type.
- Startup performs one attempt per critical dependency and has one overall deadline; it contains no retry loop.
- Every nested connection/probe budget is finite and less than the startup budget, and every operation receives the propagated parent signal.
- Lifecycle phase and dependency readiness remain separate: dependency failure never moves lifecycle backward, while draining/failed/stopped always override dependency state.
- Only PostgreSQL and Redis are critical for the Identity reference process. Broker, object storage, and telemetry export cannot become fake readiness dependencies.
- A monitor cycle never overlaps itself and owns at most one probe per critical dependency. It stores only finite stable state and stops before dependencies close.
- Health requests read process-local snapshots and initiate no dependency work, retry, allocation proportional to caller input, or topology lookup.
- Public health never includes dependency names, endpoint/host topology, error text, credentials, retry counts, process identifiers, or arbitrary values.
- `tryBeginWork()` returns no lease unless lifecycle and every critical gate are ready.
- Configuration or listener construction failure fails closed and cleans partial resources. Dependency unavailability keeps a live process not ready so bounded recovery can succeed.
- One lifecycle coordinator and one process-signal binding own shutdown. No package installs a competing signal handler or deadline.
- Shutdown stops traffic, drains accepted work, stops the monitor, flushes telemetry, and closes dependencies inside the one lifecycle budget.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Invalid, accessor-backed, excessive, or secret-bearing configuration | Fail before listener or client construction with bounded cause-free issues; never reflect input | Existing redacted configuration diagnostic only |
| Parent cancellation or startup deadline expires | Abort every in-progress startup owner, keep or move the process to finite not-ready behavior, and start no nested retry | Finite dependency cancelled/timeout outcomes plus one stable startup event |
| PostgreSQL or Redis initial connect/probe is unavailable | Process remains live and not ready with `dependency_unavailable`; the single monitor owns later recovery | Existing finite dependency operation outcomes; no dependency label in public health |
| A ready critical dependency later fails | Overall readiness becomes not ready without changing lifecycle phase; new work leases are rejected | One probe outcome and bounded readiness transition event |
| All critical dependencies recover | Overall readiness becomes ready while lifecycle stays ready; no process restart | One stable recovery transition event |
| Probe throws, returns malformed data, or ignores caller state | Classify the gate unavailable, sanitize the cause, and rely on adapter/monitor deadlines without overlap | `error`, `unavailable`, or timeout at the owning dependency boundary |
| Monitor scheduler or random provider fails | Fail closed to dependency-unavailable, stop scheduling unbounded work, and keep shutdown available | One sanitized monitor failure event |
| Health provider throws or returns an invalid/accessor snapshot | Return stable `500 INTERNAL_HTTP_ERROR`; never reflect the value | Bounded HTTP failure outcome only when HTTP telemetry is composed |
| Health route receives unsupported method or path | Preserve strict routing and return a stable bounded error without invoking dependency or GraphQL work | Bounded HTTP route/status only |
| Telemetry export is unavailable | Requests and readiness remain correct; flush/shutdown remains finite | Existing telemetry failure/drop signals |
| Listener bind fails | Abort partial startup, close constructed owners, mark startup failure, and return a sanitized start result | Stable startup failure event without host, port, or raw error |
| Shutdown races monitor/startup/recovery | One shutdown owns cancellation; no new probe or lease starts; late completions cannot restore readiness | Existing lifecycle stages plus finite dependency outcomes |

## Data and contracts

- Schema/migration: None.
- GraphQL: No schema, Apollo instance, resolver, Federation directive, or `/graphql` implementation. The unmounted adapter response remains stable.
- Events: None.
- Cache: No Redis command, key, TTL, lease, invalidation, or durable assumption.
- Public runtime contracts: Finite deadline, critical-dependency readiness snapshot/transition, monitor lifecycle, stable public health snapshot, and Identity service start/stop result types using repository-owned types only.
- HTTP contract: Fixed case-sensitive `/health/live` and `/health/ready`, `GET` and `HEAD` only, bounded JSON, `Cache-Control: no-store`, stable status codes, and no topology disclosure.
- Compatibility: Pinned Node.js `24.19.0`, pnpm `11.24.0`, existing exact Express/Apollo compatibility boundary, existing exact PostgreSQL/Redis clients, and Linux/WSL process-signal support. Native Windows signal behavior remains unclaimed.
- Reference configuration: Require non-secret `ASTER_HTTP_HOST` (`127.0.0.1` or isolated-container `0.0.0.0`), `ASTER_HTTP_PORT` (1024–65535), and `ASTER_STARTUP_DEADLINE_MS` (5000–300000). The service composition retains the phase-owned internal dependency and monitor budgets instead of introducing unused environment controls.
- Retention/deletion: Deadline, readiness, monitor, and service state are process-local and end on shutdown. No durable record is created or deleted.

## Security and privacy

- Authorization: Health endpoints contain no user or privileged data and perform no mutation. Product routes do not exist. Future product endpoints retain owning-context authorization.
- Input limits: Exact routes and methods, bounded listener values, finite dependency set, finite startup/operation/monitor/shutdown budgets, one non-overlapping cycle, and bounded stable snapshots.
- Sensitive data: Database/Redis URLs remain inside configuration and adapter construction. Health, public errors, logs, metrics, tests, and diagnostics exclude URLs, credentials, raw dependency errors, request values, and topology.
- Abuse cases: Health polling cannot trigger network probes; slow dependencies cannot create overlapping monitor cycles; request traffic cannot bypass readiness leases; malformed providers/accessors cannot execute during validation; shutdown cannot leave a monitor creating new work.

## Implementation steps

1. [completed] Release P01-R07 and rebase P01-R08 onto corrective released `main` at `61226eb`.
2. [completed] Implement the dependency-free propagated deadline contract with hostile-input, parent-cancellation, deterministic-timeout, remaining-budget, and idempotent-disposal tests.
3. [completed] Implement the bounded readiness controller over the released lifecycle with pending/ready/unavailable critical gates, stable public snapshots, recovery without phase rollback, and ready-only work leases.
4. [completed] Implement the single non-overlapping recovery monitor with deterministic scheduler/jitter seams, one probe per critical dependency, cancellation, stop-before-close, late-completion, and failure tests.
5. [completed] Extend the Express adapter and ADR-0011 with fixed non-cacheable liveness/readiness routes, exact methods/status/body behavior, provider hardening, and real-socket tests while preserving `/graphql` behavior.
6. [completed] Add only the reference listener/startup configuration fields required by the service, with classification, hostile-source, bounds, diagnostics, and compatibility tests.
7. [pending] Create the product-empty Identity composition root using injected controlled ports first, then compose the released real adapter factories behind the same boundary. Prove startup deadline propagation, unavailable startup, recovery, request admission, partial-start cleanup, one signal owner, ordered shutdown, and vendor-free inner declarations.
8. [pending] Add a loopback diagnostic that starts the reference process with controlled dependency ports, verifies stable health transitions and bounded stop, and exits naturally without product state.
9. [pending] Consolidate documentation/evidence, run the affected and forced complete gates, repeat an exact frozen checkout for new workspace/package/export/public-command inputs, and perform one complete review plus one confirmation round.
10. [completed] Rebase the unpublished branch after the P01-R07 corrective release; repeat the affected gate before the next source checkpoint.

## Tests

- Domain: Not applicable; no product domain behavior.
- Application: Pure deterministic deadline, readiness transition, admission, monitor scheduling/cancellation, and startup orchestration tests with controlled ports.
- Integration: Real Node.js sockets for health route and lifecycle behavior. Real PostgreSQL and Redis containers, stop/recovery transitions, and authentication remain P01-R09.
- Contract: Exact public health JSON/status/method/cache behavior; repository-owned declarations; no Express/vendor type leakage into runtime or service inner boundaries; configuration classification; package exports.
- Browser: Not applicable; no UI.
- Performance/failure: Startup and operation timeout, parent abort, no overlapping probes, one probe per dependency, scheduler/provider failure, missing dependency, recovery, partial listener/client failure, concurrent stop, termination during tracked work, natural process exit, and no residual timer/socket handle.

## Evidence

- Commands: Focused package typecheck/build/tests and targeted lint/format per checkpoint; `pnpm check:changed` per coherent candidate; one `pnpm check --force` when the entire item stabilizes; loopback process diagnostics; exact frozen no-generated-state checkout; audit and secret scan; protected CI only after predecessor-first rebase/publication.
- Raw artifact path: `evidence/phase-01/runtime-composition.txt`.
- Acceptance result: Deadline, readiness, recovery-monitor, fixed-health-route, and reference-configuration contracts are implemented; 80 runtime tests, 10 HTTP tests, and 13 configuration tests pass. Service composition remains pending.
- Iteration gate: Run only the changed runtime/HTTP/config/service build, typecheck, tests, diagnostic, and targeted lint/format after each coherent behavior checkpoint.
- Candidate gate: Run `pnpm check:changed` after the combined runtime contracts, after the combined HTTP/service composition, and at closeout. Run the forced complete graph once after source, declarations, documentation, and evidence stabilize.
- Heavyweight repeat triggers: Repeat exact frozen checkout for workspace, dependency, lockfile, package/export/declaration, install, bootstrap, service entrypoint, or public command changes. Repeat real-socket/subprocess handle evidence for listener, signal, timer, cancellation, monitor, request admission, startup, or shutdown changes. Real dependency/container evidence remains exclusively P01-R09.
- Review stopping rule: Collect one complete initial review and batch related blocking remediation. Run one confirmation review. Start another round only when remediation changes or reveals a requirement, security/data invariant, availability behavior, lifecycle guarantee, or public contract.

## Rollback or recovery

Before release, remove `services/identity` and the new runtime/HTTP/config exports independently because they own no durable state and no later service consumes them. If health-route composition weakens ADR-0011, restore the previous adapter and propose a replacement ADR. If a dependency cannot meet the propagated deadline or monitor contract, keep the service live/not-ready, remove that composition, and return the behavior to P01-R07 or P01-R09 with exact failure evidence. If P01-R07 changes, rebase from its released squash and repeat affected tests before any publication.

## Documentation updates

- Update ADR-0011, Runtime Lifecycle, HTTP Transport, Configuration and Environments, Runtime Platform Runway, technology baseline, Phase 01 evidence index, and local development only when their described behavior exists.
- Record exact health shapes, startup/dependency budget hierarchy, monitor ownership, shutdown order, local diagnostic, limitations, and recovery without claiming real-container interoperability.
- Keep GraphQL, accounts/profiles/sessions, schemas/migrations, cache policy, real dependency recovery, Compose exposure, Collector/backend, dashboards, SLOs, and final evaluator commands explicitly planned.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
