# Operational Runbooks

These runbooks are starting procedures. Start diagnosis with the provisioned
[operational overview](OPERATIONAL_OVERVIEW.md): user impact establishes the
affected journey, dependency health narrows the failing boundary and runtime
saturation distinguishes CPU, memory, event-loop or PostgreSQL pool pressure.
The critical-journey burn alerts link directly to the first runbook below.

---

## Runbook: Critical-journey SLO burn

### Trigger

- `AsterCriticalJourneySloRapidBurn`: one rapid long/short pair exceeds 14.4x
  over 1 hour/5 minutes or 6x over 6 hours/30 minutes;
- `AsterCriticalJourneySloSustainedBurn`: one sustained pair exceeds 3x over
  1 day/2 hours or 1x over 3 days/6 hours.

Both windows in a pair must exceed the threshold derived from the affected
SLI's error budget. `page` means immediate response intent and `ticket` means a
working-hours response intent. The local profile has no Alertmanager receiver,
so those labels do not claim that a notification was delivered.

### User impact and owner

| SLI | Owner | Impact |
|---|---|---|
| `supergraph` | Platform | A valid first-party GraphQL operation cannot complete through the public API. |
| `catalog_title_read` | Catalog | A viewer cannot obtain a timely authoritative title-detail visibility result. |
| `playback_start` | Playback | An otherwise eligible viewer cannot obtain a timely playback session. |
| `progress_write` | Engagement | A current playback checkpoint is not durably accepted inside the interaction budget. |

### Confirm

Replace `<sli>` only with one value from the table. Start with the current SLI
and measured population in Prometheus or the linked operational overview:

```promql
aster:sli:good:ratio_rate5m{sli="<sli>"}
```

```promql
aster:sli:population:rate5m{sli="<sli>"}
```

For a rapid alert, inspect both pairs rather than only the alert value:

```promql
aster:sli:error:ratio_rate1h{sli="<sli>"}
aster:sli:error:ratio_rate5m{sli="<sli>"}
aster:sli:error:ratio_rate6h{sli="<sli>"}
aster:sli:error:ratio_rate30m{sli="<sli>"}
```

For a sustained alert, inspect:

```promql
aster:sli:error:ratio_rate1d{sli="<sli>"}
aster:sli:error:ratio_rate2h{sli="<sli>"}
aster:sli:error:ratio_rate3d{sli="<sli>"}
aster:sli:error:ratio_rate6h{sli="<sli>"}
```

Confirm that Prometheus has enough retained history for the requested window.
The local store is capped by three days and 128 MB, whichever is reached first;
a fresh or size-evicted store cannot establish a complete long-window result.
Inspect bounded local TSDB status when needed:

```bash
curl --fail --silent --show-error --max-time 3 http://127.0.0.1:9090/api/v1/status/tsdb
```

### Immediate mitigation

1. Identify the affected SLI and whether current population is still non-zero.
2. Use the overview's dependency and saturation layers to locate the first
   failing boundary; do not infer cause from the SLO alert alone.
3. Stop or roll back the latest relevant change when it aligns with onset and
   the documented release rollback is safer than forward repair.
4. Reduce optional work or isolate an unhealthy dependency through an already
   verified fallback. Never bypass authorization, rights checks, durable-write
   ownership or idempotency to improve a ratio.
5. Preserve timestamps, exact queries, deployed revisions and sanitized logs.

### Diagnose

- `supergraph`: separate Router rejection from unexpected failure, then inspect
  subgraph/dependency outcome and latency without treating expected admission
  rejection as bad traffic.
- `catalog_title_read`: check Router TitleDetail latency, Catalog PostgreSQL,
  cache degradation and circuit state; PostgreSQL remains visibility authority.
- `playback_start`: check publication read, session persistence, manifest
  availability and owner timeouts; `not_playable` remains excluded and must not
  be converted to success.
- `progress_write`: check owner authorization, PostgreSQL admission, limiter and
  dependency outcomes; do not replay writes without their original idempotency
  identity.

Use traces and sanitized logs only after metrics identify the boundary. The SLI
label is finite; never add a profile, title, request or trace identifier to the
alert query.

### Recovery verification

1. Confirm the current five-minute population and good ratio are present when
   qualifying traffic exists.
2. Confirm the applicable short error window falls below its threshold; both
   alert names must return inactive from `/api/v1/alerts` after the active burn
   stops.
3. Exercise one real affected journey and its owner-side result without using a
   synthetic success metric.
4. Verify product health independently. Prometheus recovery is not product
   recovery, and product health does not prove the alert rule loaded.

### Rollback and escalation

Rollback follows the change that caused user impact, not the alert rule. If the
rule itself is invalid, restore the last reviewed SLO/alert files and restart
only the optional observability profile; do not delete product volumes.

Escalate immediate intent to the affected owner plus Platform when rapid burn
persists or crosses owners. Escalate suspected corruption, unauthorized access
or rights violation through the security/rights incident path independently of
error budget. The local repository does not define a real person, schedule or
external receiver; Phase 14 must supply those before hosted notification.

### Follow-up evidence

Record the SLI, class, pair, exact threshold, first/last firing time, retained
history, user impact, diagnosis, mitigation, recovery query, relevant revision
and whether the alert detected the issue before another signal. Do not turn a
synthetic fixture or partial local window into a field reliability claim.

---

## Runbook: Trace-led local Catalog diagnosis

### Scope

Use this procedure only for the disposable P12-R10 local exercise. It does not
authorize production failure injection, arbitrary session termination or
changes to the retained `aster` project. The automated command is:

```bash
pnpm diagnostics:run
```

It creates its own UUID-scoped project and accepts no target or flags.

### Diagnose in order

1. Confirm a new `catalog_title_read` population event and its good-event
   result. Metrics establish impact; they do not prove cause.
2. Read the bounded Router operation log and take its validated trace ID.
3. Require recent-store TraceQL search to return that exact trace ID and select
   only the scenario boundary, operation, outcome, status and service fields.
   For dependencies, require the exact dependency and intrinsic error status in
   the query and polling result; a successful or incomplete preview cannot end
   the wait. Use that matched span set; a recent trace-by-ID read may still be
   partial.
4. Follow only finite boundary attributes: Catalog subgraph, PostgreSQL or
   Redis dependency, operation, outcome and span status.
5. Correlate the same trace with sanitized Router/Catalog event categories.
   Never search by profile, title, request body, SQL, credential or media URL.
6. Apply only the scenario's scoped recovery and verify a real TitleDetail
   request, not merely health or telemetry recovery.

### Expected classifications

| Failure | User result | Required diagnosis | Recovery |
|---|---|---|---|
| Catalog stopped | failed | Router-to-Catalog trace boundary reports failure | start exact Catalog service; require Catalog health and a completed TitleDetail |
| PostgreSQL paused after one admitted read blocks | failed | same trace contains a failed Catalog PostgreSQL dependency span | unpause exact PostgreSQL service; terminate only `application_name = 'aster-p12-diagnostic-lock'`; require Catalog health and completed TitleDetail |
| Redis stopped | completed through PostgreSQL, possibly over latency target | same trace contains failed Redis dependency plus cache-unavailable log | start exact Redis service; require cache-ready log and completed TitleDetail |

Redis degradation is not a failed user SLI when the authoritative PostgreSQL
fallback succeeds. PostgreSQL failure is not recoverable from Redis because
publication visibility and rights remain durable-owner decisions.

### Cleanup and escalation

Normal completion removes only the generated project with volumes and verifies
zero matching containers, networks and volumes. If the engine disappears, keep
the exact printed UUID and wait for the same local engine to recover before
inspection. Do not restart WSL, prune Docker, delete by prefix or use the
retained-data reset to recover this fixture.

Escalate the candidate rather than accepting it when the trace is missing,
trace/log IDs disagree, a canary appears in telemetry, the SLI source has no
new population, recovery does not complete by deadline or any scoped resource
remains. Record the bounded JSON results and cleanup state in
[`evidence/phase-12/failure-diagnosis.md`](../../evidence/phase-12/failure-diagnosis.md).

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

- `aster.catalog.cache_readiness_changed` or
  `aster.discovery.cache_readiness_changed` becomes degraded;
- cache outcomes move to `bypass`, `unavailable` or bounded stale serving;
- operation limiting reports `local_fallback`;
- source-query pressure rises after cache hits collapse.

### User impact

Catalog and Discovery can become slower and optional home/search data can be
stale or explicitly degraded. Durable owner state is still PostgreSQL-backed.
An outage must never turn Redis bytes into publication, rights, identity or
mutation authority.

### Preconditions and safety

- identify the exact environment, service and cache/limiter family;
- preserve PostgreSQL capacity before generating cache misses;
- do not flush Redis, restart every service, widen concurrency or disable an
  owner-side authorization/rights check;
- do not treat local limiter fallback as a hosted multi-replica guarantee.

### Confirm

1. inspect provider or local health;
2. distinguish network, authentication, failover, and saturation;
3. inspect database load caused by bypass;
4. inspect `catalog_public_title` cache `bypass` and source-load outcomes;
5. compare Catalog readiness, Discovery readiness and user-visible result codes.

### Immediate mitigation

1. rely on the existing bounded Catalog bypass and eligible Discovery stale
   path;
2. reduce optional Discovery/search traffic before critical Catalog traffic;
3. preserve the existing database and source-operation admission limits;
4. disable an optional cache only through a reviewed controlled restart when
   repeated reconnect work is itself harmful.

### Diagnose

1. separate connection failure from malformed/wrong-type data, eviction and a
   hot-key/lease incident;
2. inspect finite cache outcome, waiter and payload-size buckets without raw
   keys or user identifiers;
3. verify owner-fence reads still occur where rights/visibility require them;
4. verify no durable write was acknowledged from a Redis-only result.

### Recover

1. restore the dependency or exact configuration;
2. let bounded reconnect/backoff complete;
3. warm only measured critical keys with bounded concurrency;
4. remove temporary traffic controls after source load stabilizes.

### Verify

- Catalog remains ready and owner-fenced reads return the same durable result;
- Discovery returns from degraded/stale to current results;
- cache outcomes and source load return to their prior range;
- no durable record, receipt, event or rights state was lost or fabricated.

### Rollback

Recreate only the affected optional-cache service with its last reviewed
configuration. Do not reset PostgreSQL, flush Redis or use a global Compose
cleanup as rollback.

### Escalation

Escalate if PostgreSQL admission begins rejecting critical owner work, cache
bypass changes a rights-visible result, reconnect loops consume unbounded
capacity, or durable mutation behavior differs during the outage.

### Evidence to preserve

- exact source/deployment, outage and recovery timestamps;
- finite readiness/cache/limiter outcomes and source-query counts;
- representative sanitized user result before, during and after recovery;
- exact scoped resource inspection and cleanup result for a game day.

### Follow-up

Revisit TTL, jitter, local-shield and source-admission policy only from measured
evidence. Phase 12 owns dashboard/SLO links; Phase 14 owns hosted capacity.

---

## Runbook: Discovery subgraph outage

### Trigger

- Router `aster.router.fetch` failures identify subgraph `discovery`;
- `aster.discovery.readiness_changed` becomes unavailable;
- home/search returns explicit unavailable, partial or fallback outcomes;
- a Discovery Catalog-read breaker opens.

### User impact

Search and computed home rails can be unavailable or degraded. Public Catalog
browse, title details and Playback must remain usable. Identity, rights and
publication checks never use a Discovery fallback.

### Preconditions and safety

- confirm the failing dependency is optional Discovery, not Catalog authority;
- keep the fixed Router and Catalog deadlines/concurrency limits in place;
- never relabel an unavailable/indeterminate result as empty success;
- never use stale or editorial data to bypass rights or authorization.

### Confirm

1. identify the exact Discovery operation and Router fetch outcome;
2. verify Catalog browse directly through the same Router remains successful;
3. inspect Discovery readiness, PostgreSQL, Redis and broker/projection state;
4. distinguish an empty rail, bounded fallback, partial result and unavailable
   projection;
5. inspect whether one search bulkhead is saturated while home capacity remains.

### Immediate mitigation

1. let public Web expose the existing explicit Catalog/editorial fallback;
2. reduce or shed search before Catalog/Playback capacity;
3. roll back only a proven bad Discovery deployment;
4. leave critical owner checks fail-closed.

### Diagnose

1. correlate Router fetch, Discovery operation and readiness events;
2. inspect projection generation/freshness and consumer lag without reading
   event payloads into evidence;
3. inspect breaker and search bulkhead outcomes;
4. determine whether Redis loss, broker lag, PostgreSQL failure or the service
   process is the first failing boundary.

### Recover

1. restore the first failed boundary;
2. allow the operation-scoped half-open probe;
3. verify the preserved generation and bounded catch-up before normal traffic;
4. remove temporary search shedding after stable current results.

### Verify

- Catalog browse and Playback remained available throughout;
- home degradation was explicit and never hid cancelled/indeterminate outcomes;
- search recovers with the preserved/current generation;
- Router/Discovery readiness and fallback outcomes return to normal.

### Rollback

Return Discovery to the last reviewed compatible image/schema. Preserve the
projection and owner events; do not rebuild or delete them merely to clear an
outage signal.

### Escalation

Escalate if Catalog/Playback are coupled to the outage, a fallback exposes an
unpublished title, projection generation regresses, or recovery requires an
owner-data rewrite.

### Evidence to preserve

- exact Router and Discovery versions, timestamps and finite event names;
- sanitized home/search and Catalog responses during outage/recovery;
- breaker/bulkhead outcomes, projection generation and cleanup result.

### Follow-up

Record the cause and whether fallback or isolation policy changed. Use the
current operational overview and linked burn runbook for finite local evidence.
Do not invent a field SLO from a game-day duration.

---

## Runbook: PostgreSQL saturation

### Trigger

- pool exhaustion;
- rising query latency;
- lock waits;
- high CPU or I/O;
- timeouts;
- replica lag when used.

### User impact

Owner reads/writes can become slow, return bounded unavailable/backpressure
results or time out. Optional work must shed before critical rights,
publication, session and durable-save work. Saturation never permits a cache or
client to acknowledge durable state.

### Preconditions and safety

- identify the owning context and operation class;
- preserve the current pool, application admission and statement deadlines;
- do not raise pool size, retry writes, kill arbitrary sessions or run broad
  maintenance without owner authorization and exact evidence;
- treat an indeterminate commit as indeterminate, never as rollback.

### Confirm

1. identify top operations and query fingerprints;
2. inspect active transactions and lock waits;
3. inspect recent migrations or traffic change;
4. inspect cache behavior;
5. inspect long transactions and event consumers.

### Immediate mitigation

1. shed optional/search/background work using existing admission controls;
2. retain critical owner traffic within its finite lane;
3. use bounded stale data only for already eligible non-authoritative reads;
4. roll back a proven bad query/deployment;
5. cancel only an exact verified harmful operation through an approved
   procedure.

### Diagnose

1. compare application rejected/admitted counts with pool reserved/vendor
   waiting counts;
2. identify the bounded operation and query fingerprint, not raw user values;
3. inspect statement/connection timeouts, lock owners and transaction age;
4. verify retry ownership so an unhealthy database is not receiving multiplied
   attempts.

Do not blindly increase pool size; it can worsen database contention.

### Recover

1. restore the failed database/query boundary;
2. drain backlog gradually under the same finite admission;
3. remove temporary shedding only after pool waits and latency stabilize;
4. record the relevant query plan and deployment change.

### Verify

- overflow is rejected before an unbounded vendor wait and capacity is released;
- unrelated/critical lanes retain the documented behavior;
- no uncertain write is automatically retried or reported completed;
- pool, lock and latency observations return to the prior range.

### Rollback

Roll back the exact query/application release or controlled configuration
change. Do not restore from backup or resize the pool solely to clear a game-day
alarm.

### Escalation

Escalate on data-integrity uncertainty, sustained rejection of critical owner
work, lock chains without a proven safe owner, replica inconsistency or storage
exhaustion.

### Evidence to preserve

- exact source/deployment and saturation/recovery timestamps;
- admitted/rejected/reserved/waiting counts and sanitized query fingerprint;
- invariant checks, rollback decision and final recovery result.

### Follow-up

Tune admission or query behavior only from a representative measured workload.
Capacity targets and soak/load conclusions belong to Phase 14.

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

### User impact

Owner transactions can still commit while outbox facts remain pending; derived
projections and profile-deletion cleanup can lag. Anonymous browsing/playback
can remain available. A zero outbox count alone does not prove consumer
completion.

### Preconditions and safety

- identify the exact owner, topic, partition and environment without copying
  payloads or signing material;
- preserve outboxes, broker log, quarantine, offsets and deletion fences;
- never edit an event, reset offsets broadly, replace a signing key blindly or
  delete durable state to regain capacity.

### Confirm

1. distinguish broker outage from consumer failure;
2. inspect outbox growth and disk capacity;
3. identify affected partitions and poison events;
4. inspect source writes.

### Immediate mitigation

1. retain owner outboxes and reduce nonessential producers if bounded capacity
   is at risk;
2. pause only the failing consumer/partition when repeated poison work would
   amplify load;
3. use the existing durable quarantine procedure for an exact invalid record;
4. serve owner source or eligible bounded stale projections where designed.

### Diagnose

1. compare owner pending age/count, relay lease, publish outcome, partition lag
   and consumer state;
2. distinguish broker unavailability, contract/signature rejection, poison
   data and unavailable owner storage;
3. verify offsets advance only after durable effect, duplicate recognition or
   durable quarantine;
4. inspect downstream saturation before draining backlog.

### Recover

1. restore the broker/consumer dependency or exact topic configuration;
2. resume with existing bounded concurrency/backoff;
3. drain gradually while monitoring owner database and downstream admission;
4. replay only an exact quarantined record after its cause is corrected.

### Verify

- pending facts drain to zero and consumer lag converges to zero;
- the same broker record delivered twice has one durable effect;
- durable progress/source state is unchanged and signed deletion recovers;
- shutdown and exact disposable cleanup leave no owned fixture resources.

### Rollback

Disable the reviewed events overlay and recreate only compatible owner
processes as documented in `services/engagement/EVENT_DELIVERY.md`. Preserve
schemas, outboxes, log, quarantine and signing-key volume.

### Escalation

Escalate missing/conflicting signing authority, full quarantine, outbox storage
risk, unbounded lag after recovery, deletion-fence conflict or any apparent lost
durable fact.

### Evidence to preserve

- exact source, topic/partition and finite record/correlation identifiers;
- pending/lag/offset counts, outage/recovery timeline and duplicate-effect count;
- quarantine decision, owner invariant and scoped cleanup result.

### Follow-up

Record the first failed boundary and backlog drain behavior. Hosted retention,
replication, ACL/TLS and restore sizing remain Phase 14 work.

---

## Runbook: Media-worker failure

### Trigger

- `aster.catalog.media_failed` or a terminal processing attempt;
- process timeout, cancellation, output limit or nonzero FFmpeg/validator exit;
- repeated lease expiry with no completed validated candidate;
- scratch growth while no owned attempt is progressing.

### User impact

The affected title/version cannot publish a new rendition. Existing validated
publications remain available. No partial candidate, master playlist or object
prefix may become public.

### Preconditions and safety

- identify the exact processing request, attempt, rights revision and scratch
  directory through owner records;
- confirm the source rights record is still approved before retry/reuse;
- never delete unknown scratch, overwrite immutable objects, publish a partial
  bundle or route media bytes through application services;
- keep worker process, output, time, concurrency and retry bounds unchanged.

### Confirm

1. inspect the finite failure class and processing-attempt audit;
2. verify Catalog has no active publication/candidate pointer for failed output;
3. inspect owned process-tree termination and worker slot release;
4. compare scratch contents with the exact request/attempt ownership record;
5. distinguish source/download, FFmpeg, validation, storage and rights failure.

### Immediate mitigation

1. stop admitting more work for the affected title/version when a repeat would
   reproduce a permanent failure;
2. cancel the exact owned worker/process group when its deadline expires;
3. preserve the failure audit and verified original;
4. keep any existing validated publication active unless rights/integrity is
   uncertain.

### Diagnose

1. inspect bounded sanitized stderr/result classification, never shell-expanded
   arguments or credentials;
2. verify checksum, rights revision, recipe/version and immutable-object state;
3. inspect worker slot, deadline, process group and scratch ownership;
4. classify retryable only the documented transient failures within attempt
   capacity.

### Recover

1. correct the first failed dependency/input or restore the compatible worker;
2. submit one owner-authorized bounded retry when the durable rule permits it;
3. validate the complete bundle before Catalog publication;
4. remove only exact stopped/expired disposable scratch through the fenced
   cleanup procedure.

### Verify

- the failed process group has no live child and its worker slot is released;
- failure audit remains, no partial publication is visible and prior media is
  unchanged;
- a recovered attempt produces a fully validated immutable bundle before
  publication;
- exact scratch cleanup reports only owned removals and no active reference.

### Rollback

Keep or restore the previous validated compatible publication. Do not downgrade
rights state, delete the failure audit or reuse an unverified candidate.

### Escalation

Escalate uncertain media rights, checksum mismatch, immutable-object conflict,
repeated process-tree leak, active-reference cleanup ambiguity or inability to
prove that partial output stayed private.

### Evidence to preserve

- exact source/worker image, attempt/failure class and bounded timestamps;
- process exit/timeout/cancellation outcome, validation report and publication
  pointer state;
- scratch ownership/cleanup result without signed URLs or source credentials.

### Follow-up

Correct the worker or pipeline invariant before another attempt. Hosted storage
budget/lifecycle and large-scale worker capacity remain Phase 14 work.
