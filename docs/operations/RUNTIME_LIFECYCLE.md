# Runtime Lifecycle

`@aster/runtime` owns the reusable process lifecycle for Node.js services. The current P01-R05 source implements health state, bounded in-flight drain, ordered shutdown hooks, process signals, Node.js HTTP closure, and stable lifecycle logging. It does not create a service or expose an HTTP health route.

## State and health

Lifecycle state is process-local and monotonic:

| Phase | Liveness | Readiness | Stable reason |
|---|---|---|---|
| `starting` | `live` | `not_ready` | `starting` |
| `ready` | `live` | `ready` | `ready` |
| `draining` | `live` | `not_ready` | `draining` |
| `failed` | `not_live` | `not_ready` | `startup_failed` |
| `stopped` | `not_live` | `not_ready` | `stopped` |

`markReady()` can move only `starting` to `ready`. `markStartupFailed()` can move only `starting` to `failed`. A process cannot become ready again after failure or shutdown. Health snapshots are frozen and expose no exception, hostname, port, URL, dependency name, credential, or request value.

Dependency-specific readiness belongs to P01-R08. A future service health route may publish this stable snapshot, but no public endpoint exists yet.

## Composition

The service composition root creates one coordinator and one signal binding:

```ts
const http = createAsterNodeHttpLifecycleHooks(server);
const lifecycle = createAsterServiceLifecycle({
  stopTraffic: http.stopTraffic,
  forceClose: () => {
    http.forceClose();
    forceCloseConsumers();
    forceCloseDependencies();
  },
  logger,
  shutdownDeadlineMs: 10_000,
  stopConsumers: async (signal) => stopConsumers({ signal }),
  flushTelemetry: async (signal) => flushTelemetry({ signal }),
  closeDependencies: async (signal) => closeDependencies({ signal }),
});

const signals = bindAsterProcessSignals(lifecycle);
lifecycle.markReady();
```

Domain and application code do not import this composition or Node.js HTTP types. Express and Apollo remain inside `@aster/http-express`.

`forceClose` is the composition root's last-resort closure for every owned resource that can keep the event loop alive after a resource-closing hook rejects or ignores cancellation. The example names HTTP, consumer, and dependency force paths explicitly; a service with fewer owners supplies only its real force paths. Each adapter keeps framework and client types behind its own boundary.

## Shutdown contract

The first shutdown request immediately fails readiness and returns one shared Promise. Concurrent calls observe the same terminal result and never repeat hooks. The coordinator then gives these stages one bounded opportunity in fixed order:

1. stop new HTTP traffic;
2. drain lifecycle-tracked in-flight work;
3. stop consumers and schedulers;
4. flush telemetry;
5. close dependencies.

Every asynchronous stage receives the same `AbortSignal`. The default overall deadline is 10 seconds, accepted configuration is 100 milliseconds through 30 seconds, and nested stages must not create a new unbounded shutdown budget.

Call `tryBeginWork()` only after readiness. It returns no lease before readiness or after drain begins. Every accepted lease must call `complete()` in `finally`; duplicate completion is harmless.

A rejected hook records only its stable stage and continues remaining eligible stages; the raw rejection is not returned or logged. When traffic, consumer, or dependency closure rejects, the coordinator invokes global force close once after those eligible stages and produces `forced` with reason `stage_failure`. An isolated telemetry-flush rejection produces `degraded` after dependency closure because exporter resource ownership belongs to that later close stage. A hook that ignores cancellation cannot hold the process forever: the deadline aborts the shared signal, invokes force close once, and produces `forced` with reason `deadline`.

## Process signals

`bindAsterProcessSignals()` installs removable `SIGINT` and `SIGTERM` listeners. One process target cannot have competing Aster signal owners.

- The first signal starts graceful shutdown and preserves conventional exit status `130` for `SIGINT` or `143` for `SIGTERM`.
- A repeated signal during active drain requests immediate force close.
- Completion or explicit `dispose()` removes both listeners and releases signal ownership.

The binding does not call `process.exit()`. Resource closure lets the event loop finish naturally, so buffered output and eligible cleanup retain their bounded opportunity.

## Node.js HTTP behavior

`createAsterNodeHttpLifecycleHooks(server)` converts a Node.js HTTP server into `stopTraffic` and `forceClose` hooks. It always calls `server.close()` before `server.closeAllConnections()`, including an immediate repeated-signal race. This preserves the documented race-free order:

- `server.close()` stops accepts, closes idle connections, and waits for active connections;
- an in-flight request may finish inside the overall deadline;
- a new connection is refused after drain begins;
- deadline or repeated signal may then destroy remaining active connections.

Apollo's HTTP drain plugin remains responsible for Apollo-to-HTTP compatibility. It must participate inside the same process lifecycle rather than installing a second signal owner or deadline.

## Lifecycle events

When the existing Aster logger is supplied, the coordinator emits only these stable event names and bounded properties:

| Event | Level | Properties |
|---|---|---|
| `aster.lifecycle.ready` | info | phase |
| `aster.lifecycle.startup_failed` | warn | phase |
| `aster.lifecycle.shutdown_started` | info | trigger |
| `aster.lifecycle.stage_failed` | warn | stage |
| `aster.lifecycle.shutdown_forced` | warn | reason |
| `aster.lifecycle.shutdown_completed` | info or warn | outcome, trigger |

Logger failure is ignored by lifecycle control. The log sink cannot change state, restart a stage, or extend the deadline.

## Verification

Run the focused package gate without Docker:

```bash
pnpm --filter @aster/runtime typecheck
pnpm --filter @aster/runtime build
pnpm --filter @aster/runtime test
```

The suite exercises hostile configuration, health transitions, shared shutdown, exact stage order, hook failure, deterministic deadline, repeated signals, logger failure, a real `SIGTERM` subprocess, and real loopback sockets for graceful and forced HTTP closure. The process-signal diagnostic is skipped on native Windows because its Unix signal semantics are not portable; the supported WSL path executes it.

Current raw evidence and limitations are in [P01-R05 lifecycle evidence](../../evidence/phase-01/runtime-lifecycle.txt).

## Recovery

If a service remains ready during shutdown, verify that every composition path uses the same lifecycle instance and does not expose transport readiness independently. If shutdown reaches the deadline, inspect the stable failed stage and the owning adapter, then reproduce with its focused test; do not increase the deadline without measuring the blocking operation.

If termination remains stuck after `forced`, verify that every owned resource has a force-close path and that no package installed competing signal listeners. Use `process.listenerCount("SIGTERM")` only as a local diagnostic; do not expose listener or topology details through public health output.
