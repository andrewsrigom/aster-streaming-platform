# Phase 11 resilience game days

Date: 2026-08-30

Status: PR44 corrected source ad99ef6; protected closeout release pending

## Source and applicability

- Released product-runtime base: main
  `59600aea669d34ec727c1f243d162608261295aa`.
- Exact protected failure-lab/game-day runtime head:
  `371ba55eb7269520b72f41fd813a95aaeab819eb`.
- Protected run:
  [33291705269](https://github.com/andrewsrigom/aster-streaming-platform/actions/runs/33291705269),
  all required jobs successful.
- Current executable/test source: `ad99ef675953d47a7f03161c94468f9292476de0`,
  tree `999171632a8823886c47b4d7b06a86303c88d3d5`.

The protected runtime executes exact predecessor `371ba55`, including every
named owner harness. The later game-day diff adds repository memory/evidence,
operator documentation, Web/Router tests and their source guard. Its only
product-source change extracts the existing Apollo client composition into the
factory already used by `GraphqlProvider`; the link order and runtime behavior
remain unchanged, and the test now exercises that exact chain. No owner service,
worker, package runtime or Compose behavior changes. Current focused checks
cover the added contracts.

Environment for hosted scenarios: ephemeral GitHub Actions Ubuntu runner,
UUID-scoped Compose projects, pinned repository images/dependencies and exact
project cleanup. Local focused scenarios use WSL Ubuntu-20.04, Node.js 24.19.0
and pnpm 11.24.0 without Docker or retained state.

The final corrected affected candidate passes 17/17 tasks, 2 cached, in 57.471
seconds.
It includes Web112/112, platform67/67, all repository documentation/memory,
strict static checks and the scoped failure-lab/toolchain tests.

## Game day 1 — Discovery outage

Trigger: stop the disposable Discovery service after federated home/search are
healthy.

Timeline from protected run `33291705269`, source-quality job `99204404114`:

1. `04:19:10Z`: public home is already available while its optional Redis is
   absent.
2. `04:19:15Z`: Discovery is unavailable; Router remains ready and Catalog
   browse returns successfully.
3. Public Web/browser behavior is the explicit degraded/fallback result; focused
   home tests prove fallback applies only to empty/unavailable outcomes and
   cannot hide cancelled or indeterminate primary results.
4. `04:19:44Z`: Discovery restarts; the projection generation is preserved and
   search recovers.
5. `04:19:46Z`: exact fixture cleanup reports `remaining: 0` after 117723 ms.

User impact: home/search degrade; Catalog browse and Playback authority remain
available. Detection, mitigation, recovery and verification are in the
[Discovery outage runbook](../../docs/operations/RUNBOOKS.md#runbook-discovery-subgraph-outage).

## Game day 2 — Redis outage

Trigger: start Discovery configured for its optional cache without starting the
disposable Redis service.

Observed protected result at `04:19:10Z`:

```json
{"event":"discovery_cache_outage_runtime","redisStarted":false,"discoveryHealthy":true,"publicHomeServed":true}
```

Catalog's focused current-source runtime separately reports cache readiness
degraded while Catalog readiness remains ready. Phase 10's real Redis fixture
already proves bounded malformed/wrong-type/lease recovery and local limiter
fallback; the source-equivalence proof above keeps that heavyweight result
applicable. Recovery uses the normal bounded reconnect/cache path; no durable
record is restored from Redis. Exact Discovery cleanup is the same `remaining:
0` checkpoint above.

User impact: possible higher source latency and explicit stale/degraded optional
data, never fabricated durable state. Procedure:
[Redis outage](../../docs/operations/RUNBOOKS.md#runbook-redis-outage).

## Game day 3 — Broker delay/outage and drain

Trigger: after owner backlogs/consumers are healthy, stop the disposable broker,
commit a real progress write, then restart the same broker.

Timeline from protected run `33291705269`:

1. `04:17:28Z`: quarantine is durable, offsets are committed through the end and
   lag is zero.
2. `04:17:29Z`: broker is stopped. Progress still commits, anonymous Playback
   remains available and the pending fact is retained.
3. `04:17:42Z`: broker returns. Pending facts drain to zero, durable progress is
   unchanged, background delivery completes and signed deletion consumption
   recovers.
4. Earlier in the same runtime the same record is delivered twice with one
   durable effect.
5. `04:17:45Z`: exact fixture cleanup reports `remaining: 0` and the retained
   runtime was not touched.

Procedure:
[Broker outage or consumer lag](../../docs/operations/RUNBOOKS.md#runbook-broker-outage-or-consumer-lag).

## Game day 4 — Database saturation/load shedding

Trigger: hold the only configured PostgreSQL adapter acquisition and concurrently
request another operation; separately fill the Catalog HTTP owner lane.

Current-source controlled result:

- PostgreSQL adapter/transaction suites pass 28/28 in 460.935404 ms.
- The abandoned acquisition remains counted until its late connection is
  destroyed. The concurrent call returns `capacity_exceeded`; reserved slots
  return to zero afterward.
- Catalog admits eight active owner requests, rejects the ninth with bounded HTTP
  503 before more owner work, cancels admitted calls on shutdown and preserves
  independent rate recovery. The full focused failure set passes 68/68 in
  4713.043505 ms.

This is adapter/application saturation, not stress against a shared real
database. It proves finite admission, honest unavailable/cancelled results and
recovery without a write retry; Phase 14 owns representative real-host capacity.
Procedure:
[PostgreSQL saturation](../../docs/operations/RUNBOOKS.md#runbook-postgresql-saturation).

## Game day 5 — Media-worker failure and cleanup

Trigger: run an owned process that spawns a child and exceeds its two-second
deadline; separately cancel processing after rights revocation.

Observed result:

- Local current-source process-tree test passes in 2029.140597 ms. The parent
  and child are terminated as one process group; exact temporary state is
  removed in `finally`.
- The same exact-head protected test passes in 2082.534791 ms.
- Current focused Catalog execution proves rights revocation cancels a pending
  download and retains failure audit. The protected source suite also proves
  processing cancellation retains its classified audit, corrupt reuse does not
  overwrite/fallback, owner dependency failure exposes no publication and a
  missing/corrupt/cancelled/revoked bundle gains no public access.

Existing validated media remains untouched. No full film was transcoded and no
retained scratch was deleted. Procedure:
[Media-worker failure](../../docs/operations/RUNBOOKS.md#runbook-media-worker-failure).

## Fallback and retry-amplification examples

| Failure | Honest result | Safety boundary |
| --- | --- | --- |
| Discovery down | explicit Web degradation/fallback; Catalog browse succeeds | no rights/auth fallback |
| Redis down | Discovery home served; cache readiness degraded | PostgreSQL remains authority |
| Broker down | durable progress commits; pending fact retained | no fake delivery acknowledgement |
| DB lane full | `capacity_exceeded` / HTTP 503 | no vendor queue or write retry |
| Media process timeout | classified failure, no publication | process group and scratch stay owned |

The separate [retry amplification report](retry-amplification.txt) proves the
synchronous path is 1 Web attempt x 1 Router attempt x at most 2 attempts by the
single safe-read service owner.

## Interpretation and limitations

All five named failures have bounded detection, user impact, mitigation,
recovery, verification and cleanup evidence. Optional failures preserve critical
owner behavior; critical failures remain honest. These are laboratory game days,
not field SLOs, production capacity or hosted disaster recovery. Phase 12 adds
operational dashboards/alerts and Phase 14 repeats representative release and
capacity scenarios in the selected hosted environment.
