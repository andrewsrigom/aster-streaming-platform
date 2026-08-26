# Node.js in Production

## Purpose

A Node.js service is production-ready when it remains responsive under expected load, degrades predictably under abnormal load, shuts down safely, and provides enough evidence to explain latency and memory behavior.

Aster exercises these properties in request services, event consumers, and the media worker.

## 1. Event-loop model

JavaScript callbacks share one main event loop per process. Asynchronous I/O prevents the process from waiting on the operating system, but JavaScript execution, parsing, serialization, and many native callbacks still consume the event-loop thread.

A request can therefore delay unrelated requests by:

- processing a large collection synchronously;
- parsing or serializing a large payload;
- running regular expressions with pathological input;
- using synchronous filesystem or cryptographic APIs;
- compressing or transforming large data on the main thread;
- resolving a GraphQL operation with excessive field work;
- creating too many immediately resolved promises;
- processing a large event batch without yielding or bounding concurrency.

### What to measure

- event-loop delay distribution;
- event-loop utilization;
- request p95 and p99;
- CPU;
- active requests;
- operation cost or input size;
- garbage-collection pauses where available.

Average latency can remain acceptable while tail latency shows event-loop contention.

## 2. CPU-bound work

The first question is whether CPU work belongs in a request path at all.

Aster's media transcoding uses an external FFmpeg process because it is long-running, resource intensive, and durable. A small JavaScript ranking calculation may remain in-process if it is bounded and measured. A large computation may use worker threads if the transfer, serialization, and operational cost is justified.

Worker threads help CPU-bound JavaScript. They do not make ordinary database, Redis, HTTP, or filesystem I/O faster.

### Decision sequence

1. remove unnecessary work;
2. precompute or cache;
3. reduce input;
4. use a better algorithm;
5. move durable work to a background job;
6. consider worker threads for bounded CPU work;
7. scale processes after understanding the bottleneck.

## 3. Concurrency

This pattern is dangerous when `items` is input-controlled:

```ts
await Promise.all(items.map(processItem))
```

It creates concurrency equal to collection size.

A bounded alternative exposes policy:

```ts
import pLimit from "p-limit"

const limit = pLimit(8)

await Promise.all(
  items.map((item) => limit(() => processItem(item)))
)
```

The real design also defines:

- maximum input count;
- queue capacity;
- abort behavior;
- per-item timeout;
- error policy;
- whether ordering matters;
- metrics for active, queued, rejected, and duration.

A concurrency limiter with an unlimited waiting queue only moves the saturation point.

## 4. Streams and backpressure

Streams matter when data can be large or arrives incrementally.

Aster uses streams for:

- downloading source films;
- checksumming while downloading;
- uploading to object storage;
- generating large exports;
- transforming data without full buffering.

Use `pipeline` so errors and teardown propagate:

```ts
import { createHash } from "node:crypto"
import { pipeline } from "node:stream/promises"
import { Transform } from "node:stream"

const hash = createHash("sha256")

const checksum = new Transform({
  transform(chunk, _encoding, callback) {
    hash.update(chunk)
    callback(null, chunk)
  }
})

await pipeline(source, checksum, destination)

const digest = hash.digest("hex")
```

Production behavior still needs:

- byte limit;
- progress timeout;
- overall deadline;
- abort signal;
- destination cleanup;
- content validation;
- retry classification.

### Backpressure

A writable signals when it cannot accept more data immediately. Correct pipeline composition pauses upstream work instead of accumulating the entire payload in memory.

`highWaterMark` is a buffering threshold, not a file-size limit. Increasing it may improve throughput or simply increase memory.

## 5. Memory

Useful process memory fields:

```ts
const {
  rss,
  heapTotal,
  heapUsed,
  external,
  arrayBuffers
} = process.memoryUsage()
```

- `heapUsed`: live and not-yet-collected JavaScript heap.
- `heapTotal`: heap reserved by the runtime.
- `external`: native memory associated with JavaScript objects.
- `arrayBuffers`: buffers and typed arrays.
- `rss`: total resident process memory, including heap, native code, stacks, buffers, and mapped pages.

A leak is sustained retained growth under a stable workload, not one temporary increase.

### Investigation workflow

1. reproduce with a controlled workload;
2. chart RSS, heap, external memory, request rate, and GC behavior;
3. stop load and observe stabilization;
4. compare heap snapshots;
5. inspect retaining paths;
6. fix ownership or lifecycle;
7. rerun the same workload;
8. record limitations.

Common causes:

- unbounded maps;
- event listeners not removed;
- timers retaining closures;
- unresolved promises;
- request data in global caches;
- DataLoader reused across requests;
- buffers retained by queues;
- telemetry attributes holding large objects.

## 6. Graceful shutdown

A request service should:

1. receive termination;
2. fail readiness;
3. stop accepting new traffic;
4. drain in-flight requests within a deadline;
5. stop consumers and scheduled work;
6. flush telemetry within a smaller deadline;
7. close database, Redis, broker, and HTTP resources;
8. exit.

A media worker additionally releases or expires durable work ownership and kills child processes.

Shutdown itself must be bounded. A process that never exits prevents safe deployments.

## 7. Deadlines and abort signals

A timeout belongs to an attempt. A deadline belongs to the complete operation.

Pass `AbortSignal` through ports:

```ts
export interface CatalogReader {
  findPublishedTitle(
    id: string,
    options: { signal: AbortSignal }
  ): Promise<PublishedTitle | null>
}
```

Adapters translate cancellation into database, Redis, HTTP, or stream cancellation where supported.

Do not catch abort and continue expensive work without a durable reason.

## 8. Experiments in Aster

### Event-loop blocking

- create a bounded synthetic CPU path;
- run mixed lightweight and CPU-heavy requests;
- record event-loop delay and tail latency;
- remove, optimize, or offload the work;
- rerun under identical conditions.

### Streaming export

- export a large viewing-history dataset;
- compare full buffering to streaming;
- record peak RSS, first-byte time, throughput, and failure cleanup.

### Memory retention

- introduce a test-only unbounded request cache;
- demonstrate retained growth;
- capture heap evidence;
- replace it with a bounded lifecycle;
- verify stabilization.

The experiments remain gated and cannot be enabled through public production paths.

## 9. Production checklist

- no synchronous I/O in request paths;
- bounded input and concurrency;
- deadlines and cancellation;
- streaming for large data;
- measured event-loop delay;
- measured memory;
- graceful shutdown;
- classified operational errors;
- structured telemetry;
- load and failure evidence.
