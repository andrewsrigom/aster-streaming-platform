# Skill: Node.js Runtime

## Purpose

Build Node.js services that remain responsive, bounded, diagnosable, and recoverable under production conditions.

## Event loop

Assume every resolver shares an event loop with unrelated requests.

- Avoid synchronous CPU-heavy work in request paths.
- Measure event-loop delay and utilization.
- Bound JSON parsing, serialization, decompression, and collection processing.
- Use worker threads only for CPU-bound JavaScript work with measured benefit.
- Run FFmpeg as an isolated external process in the media worker.
- Do not use worker threads to make ordinary asynchronous I/O faster.

A performance change requires before-and-after evidence under the same workload.

## Concurrency

Never use unbounded `Promise.all` over input-controlled collections.

Use a named concurrency policy:

- maximum parallel operations;
- queue capacity;
- overflow behavior;
- deadline;
- cancellation;
- per-key versus global scope.

## Streams and backpressure

Use streams when data size can be large or incremental:

- media upload and download;
- checksumming;
- export generation;
- object-storage transfer;
- log or event processing.

Use `pipeline` or equivalent error-safe composition. Respect backpressure. Do not buffer a full asset merely for convenience.

## Memory

Track at least:

- RSS;
- heap used;
- heap total;
- external memory;
- array buffers;
- process uptime.

Investigate sustained growth by workload and object-retention evidence. Do not call a temporary RSS increase a leak without showing that memory fails to stabilize.

## Timeouts and cancellation

Every outbound call receives an `AbortSignal`. Prefer a propagated deadline over independent nested timeouts.

On client disconnect, cancel work that has no durable value. Do not cancel committed asynchronous work that must finish; hand it to a durable worker instead.

## Process lifecycle

Services must handle termination signals:

1. stop accepting new traffic;
2. fail readiness;
3. allow bounded in-flight completion;
4. stop consumers;
5. flush telemetry within a deadline;
6. close database, Redis, and broker connections;
7. exit with a meaningful code.

Liveness should indicate process health. Readiness should indicate whether the instance can serve its responsibility.

## Error handling

Use typed operational errors at application boundaries. Preserve causes internally. Sanitize public messages. Never continue after an unrecoverable initialization failure.
