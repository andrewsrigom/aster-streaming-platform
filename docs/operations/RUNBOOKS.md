# Operational Runbooks

These runbooks are starting procedures. Phase 12 links exact dashboard, query, and command references after telemetry exists.

---

## Runbook: Cache stampede or Redis hot key

### Trigger

- sudden Catalog or Discovery source-query surge;
- Redis key command rate concentrated on one key family;
- cache miss burst;
- database latency rises at key expiry;
- lease contention rises.

### Confirm

1. compare request rate with cache hit/miss/stale;
2. inspect source query count;
3. inspect lease acquisition and waiter count;
4. confirm synchronized expiry or hot key;
5. inspect database pool and event-loop delay.

### Mitigate

- allow bounded stale serving for eligible rails;
- reduce refresh concurrency;
- extend TTL or jitter through approved runtime control;
- disable noncritical refresh;
- protect database with load shedding;
- add temporary local caching only through an approved safe control.

Do not flush the cache.

### Recover

- verify source load returns to baseline;
- verify cache refresh succeeds;
- remove temporary changes;
- preserve trace and load evidence.

---

## Runbook: Redis outage

### Trigger

- Redis operation error ratio;
- connection failures;
- cache hit collapses;
- rate limiter enters degraded mode.

### Confirm

1. inspect provider or local health;
2. distinguish network, authentication, failover, and saturation;
3. inspect database load caused by bypass;
4. inspect user SLIs.

### Mitigate

- activate documented cache bypass;
- serve bounded stale local data where allowed;
- reduce optional discovery traffic;
- enforce local emergency concurrency limits;
- fail closed for operator-sensitive rate controls;
- protect PostgreSQL.

### Recover

- restore Redis;
- verify clients reconnect with backoff;
- warm only measured critical keys with bounded concurrency;
- verify durable data was not lost;
- inspect memory and eviction.

---

## Runbook: Subgraph outage

### Trigger

- router subgraph fetch failures;
- breaker opens;
- affected operation SLI burns.

### Confirm

1. identify subgraph and operation class;
2. inspect deployment, health, event loop, memory, and dependencies;
3. determine whether optional fields can fall back;
4. inspect query-plan serial dependencies.

### Mitigate

- roll back recent deployment;
- activate safe fallback for optional Discovery behavior;
- reduce concurrency;
- isolate expensive operations;
- scale only if saturation is proven.

### Recover

- verify readiness;
- allow half-open probes;
- verify query success and latency;
- confirm fallback rate returns to baseline.

---

## Runbook: PostgreSQL saturation

### Trigger

- pool exhaustion;
- rising query latency;
- lock waits;
- high CPU or I/O;
- timeouts;
- replica lag when used.

### Confirm

1. identify top operations and query fingerprints;
2. inspect active transactions and lock waits;
3. inspect recent migrations or traffic change;
4. inspect cache behavior;
5. inspect long transactions and event consumers.

### Mitigate

- shed optional queries;
- reduce service concurrency;
- stop runaway background work;
- use bounded stale cache where valid;
- roll back bad query deployment;
- cancel only verified harmful queries through approved procedure.

Do not blindly increase pool size; it can worsen database contention.

### Recover

- verify pool wait and query latency;
- verify invariants and replication;
- drain backlog gradually;
- record query plans.

---

## Runbook: Event-loop delay

### Trigger

- event-loop delay exceeds threshold;
- p99 rises across unrelated operations;
- CPU high or one operation dominates.

### Confirm

1. correlate operation mix;
2. inspect CPU profile or trace gaps;
3. inspect large payloads and serialization;
4. inspect unbounded concurrency;
5. compare process memory and GC.

### Mitigate

- reject or limit expensive operation;
- reduce concurrency;
- roll back;
- move durable work to worker;
- scale processes only as temporary relief when safe.

### Recover

- verify event-loop and p99;
- capture profile;
- reproduce under controlled load.

---

## Runbook: Memory growth

### Trigger

- sustained RSS or heap growth;
- repeated restarts;
- OOM risk;
- external or buffer memory growth.

### Confirm

1. correlate with workload and deployment;
2. stop load and observe stabilization;
3. inspect heap snapshots or allocation profile;
4. inspect bounded caches, listeners, timers, loaders, buffers, and queues.

### Mitigate

- reduce traffic or concurrency;
- disable leaking optional path;
- controlled restart;
- roll back recent change.

### Recover

- verify stable memory under soak;
- compare heap evidence;
- avoid calling the issue fixed after one restart.

---

## Runbook: Playback errors or missing media

### Trigger

- first-frame SLI burn;
- CDN manifest or segment 4xx/5xx;
- fatal player error increase;
- title-specific reports.

### Confirm

1. separate session, manifest, network, decode, and caption errors;
2. inspect publication ID;
3. validate master and child playlists;
4. verify referenced objects;
5. inspect CDN and origin behavior;
6. inspect recent publication change.

### Mitigate

- point Catalog to previous validated publication;
- retire affected title if rights or integrity is uncertain;
- restore missing immutable objects;
- invalidate only stable references when needed.

### Recover

- verify browser playback on supported matrix;
- verify first-frame metrics;
- validate full object manifest;
- preserve affected publication evidence.

---

## Runbook: Broker outage or consumer lag

### Trigger

- outbox age;
- publish failures;
- consumer lag;
- projection freshness SLI.

### Confirm

1. distinguish broker outage from consumer failure;
2. inspect outbox growth and disk capacity;
3. identify affected partitions and poison events;
4. inspect source writes.

### Mitigate

- retain outbox and reduce nonessential producers if capacity risk exists;
- pause failing consumer;
- quarantine poison event through procedure;
- serve source or bounded stale projection where designed.

### Recover

- drain gradually with bounded concurrency;
- monitor database and downstream load;
- verify idempotency and projection versions;
- reconcile source and projection counts.
