# Runtime Lifecycle

`@aster/runtime` owns reusable process lifecycle behavior for Node.js services. Released P01-R05 source implements health state, bounded in-flight drain, ordered shutdown hooks, process signals, Node.js HTTP closure, and stable lifecycle logging. The dependent P01-R08 candidate implements the first composition checkpoint: a propagated finite deadline. It does not yet create a service, compose dependency readiness, or expose an HTTP health route.

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

## Propagated deadlines

`createAsterDeadline()` owns one finite monotonic budget from 1 millisecond through 5 minutes. It starts one unreferenced timer, optionally listens to one parent `AbortSignal`, and exposes a derived signal plus `remainingMs()`. Parent cancellation aborts the derived signal without copying the parent's reason. Expiry aborts the same signal. Callers pass that derived signal to every nested operation and derive any smaller child budget from the non-increasing remaining value; they do not restart the original budget per dependency or attempt.

`remainingMs()` rounds a positive fractional remainder up to the next millisecond, never increases even if an injected clock regresses, and fails closed to zero plus abort if monotonic time becomes unavailable. `dispose()` cancels the timer and removes the parent listener after successful work without aborting that completed work. Disposal, expiry, and parent cancellation are idempotent. The default timer is unreferenced, so an unused deadline cannot keep a Node.js process alive.

Options must be a plain own-data object with only `timeoutMs` and optional real `parentSignal`. Unknown properties, accessors, proxies that throw, non-finite or fractional budgets, and forged signals fail with bounded cause-free issues. Deadline code invokes the platform's `AbortSignal` and `EventTarget` operations directly so caller-owned property overrides cannot execute during propagation or cleanup.

This primitive does not replace the released lifecycle shutdown coordinator or create a second shutdown budget. P01-R08 will use it for service startup and nested dependency work; readiness gates, the recovery monitor, and service composition remain planned checkpoints.

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

`forceClose` is the composition root's synchronous last-resort closure for every owned resource that can keep the event loop alive after a resource-closing hook rejects or ignores cancellation. It must attempt every owner and return `undefined`; a thrown error, returned Promise/thenable, or other returned value is classified as `force_close` failure. The example names HTTP, consumer, and dependency force paths explicitly; a service with fewer owners supplies only its real force paths. Each adapter keeps framework and client types behind its own boundary.

## Shutdown contract

The first shutdown request immediately fails readiness and returns one shared Promise. Concurrent calls observe the same terminal result and never repeat hooks. The coordinator then gives these stages one bounded opportunity in fixed order:

1. stop new HTTP traffic;
2. drain lifecycle-tracked in-flight work;
3. stop consumers and schedulers;
4. flush telemetry;
5. close dependencies.

Every asynchronous stage receives the same `AbortSignal`. The default overall deadline is 10 seconds, accepted configuration is 100 milliseconds through 30 seconds, and nested stages must not create a new unbounded shutdown budget.

Call `tryBeginWork()` only after readiness. It returns no lease before readiness or after drain begins. Every accepted lease must call `complete()` in `finally`; duplicate completion is harmless.

A rejected hook records only its stable stage; the raw rejection is not returned or logged. When traffic, consumer, or dependency closure rejects, the coordinator invokes global force close immediately, does not start later graceful stages, and produces `forced` with reason `stage_failure`. This preserves the ownership order: a consumer that failed to stop is never allowed to continue while the coordinator gracefully closes its dependencies. An isolated telemetry-flush rejection continues through dependency closure and produces `degraded` because exporter resource ownership belongs to that later close stage. A hook that ignores cancellation cannot hold the process forever: the deadline aborts the shared signal, invokes force close once, and produces `forced` with reason `deadline`.

## Process signals

`bindAsterProcessSignals()` installs removable `SIGINT` and `SIGTERM` listeners. One process target cannot have competing Aster signal owners.

- The first signal starts graceful shutdown and preserves conventional exit status `130` for `SIGINT` or `143` for `SIGTERM`.
- A repeated signal during active drain requests immediate force close.
- Completion or explicit `dispose()` removes both listeners and releases signal ownership.

Graceful completion and successful force close do not call `process.exit()`. Resource closure lets the event loop finish naturally, so buffered output and eligible cleanup retain their bounded opportunity. If the composition-wide force-close callback throws, the result records only `force_close`, then the signal owner removes its listeners and calls `process.exit()` with the first signal's conventional status. The same last-resort fallback applies if lifecycle coordination unexpectedly rejects. This path may truncate buffered output by design: it runs only after graceful and force-close ownership have failed, preventing a leaked live handle from defeating bounded process termination. A manual shutdown caller that does not use the signal binding must apply an equivalent terminal policy when `failedStages` contains `force_close`.

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

The suite exercises hostile deadline and lifecycle configuration, deterministic monotonic expiry, parent cancellation without reason copying, cleanup, an unreferenced-timer subprocess, health transitions, shared shutdown, exact stage order, hook failure, repeated signals, logger failure, a graceful real `SIGTERM` subprocess, a live-handle subprocess whose force close throws and reaches the hard fallback, and real loopback sockets for graceful and forced HTTP closure. The process-signal diagnostics are skipped on native Windows because their Unix signal semantics are not portable; the supported WSL path executes them.

Released lifecycle evidence is in [P01-R05 lifecycle evidence](../../evidence/phase-01/runtime-lifecycle.txt). The dependent deadline checkpoint is recorded in [P01-R08 runtime-composition evidence](../../evidence/phase-01/runtime-composition.txt).

## Recovery

If a service remains ready during shutdown, verify that every composition path uses the same lifecycle instance and does not expose transport readiness independently. If shutdown reaches the deadline, inspect the stable failed stage and the owning adapter, then reproduce with its focused test; do not increase the deadline without measuring the blocking operation.

If termination remains stuck after `forced`, verify that every owned resource has a force-close path and that no package installed competing signal listeners. Use `process.listenerCount("SIGTERM")` only as a local diagnostic; do not expose listener or topology details through public health output.
