# Handoff

## Resume point

Phases00–12 are released. Phase13 item64 is released through PR52/main
`fb5cf014` and exact-main run `33412728404`. Item65 final candidate head
`94c17b9`, tree `d034c03`, passed protected run `33424006919`; PR55 squash main
`8cd6c0b25938f605ded95df736b2c53b4ecff150` retained that exact tree.
Exact-main run `33425758870` passed on attempt2 after one isolated TraceQL
indexing timeout. Item65 is released.

Item66 (P13-R06/R11) is the sole `IN_PROGRESS` item on
`feat/p13-execution-rate-cache-controls`, worktree `/tmp/aster-p13-runtime`,
from exact main `8cd6c0b`. Exact source `a090285`, tree `98d3064`, is committed
and passes its affected candidate gate. It is not published, reviewed or
released yet.

## Implemented locally

- ADR-0047 records bounded GraphQL execution, account admission and cache scope.
- Operation-demand manifest version2 classifies all25 current/retained exact
  hashes as public/account/profile, assigns finite rate classes, pins the Router
  3,000 ms/eight-request boundary and requires `no-store`.
- Composition derives minimum private scope from selected owner coordinates and
  fails missing/stale/weaker policy.
- Router overwrites all public responses with `Cache-Control: no-store`; the
  packaged adverse verifier now checks that header.
- Identity create/update/delete use `profile_mutation` (8 burst,2/s); selection
  uses `profile_selection` (16 burst,4/s). A current session supplies the
  authoritative account partition, then the existing profile command repeats
  authorization before writing.
- The limiter has at most1,024 local partitions. Redis uses its existing atomic
  server-time bucket with30-second TTL and only SHA-256 account/admission
  pseudonyms. It connects on demand; rejection rejects; outage uses only local
  admission; cancellation/capacity fail closed.
- PostgreSQL is Identity's sole readiness-critical dependency. Redis remains
  lifecycle-owned and closes cleanly.
- Telemetry accepts finite `profile_mutation` and `profile_selection` labels.

## Current evidence

- Identity tests:156/156 pass.
- Router tests:21/21 plus deterministic schema check pass.
- Telemetry tests:19/19 pass.
- Router source verifier:5/5 pass.
- GraphQL rejection/cache verifier:2/2 pass.
- Build:15/15 relevant dependency/package tasks pass.
- `pnpm --filter @aster/identity integration:core` passed four disposable
  scenarios in58.870s: real atomic two-replica Redis admission, Redis outage
  fallback/recovery, PostgreSQL/optional-Redis readiness, cancellation/capacity,
  SIGTERM/HTTP drain and cleanup remaining0.
- Raw checkpoint:
  `evidence/phase-13/execution-rate-cache-controls.txt`.
- Affected candidate gate:54/54 tasks,20 cached,178.363 seconds on exact source
  `a090285`/tree `98d3064`.

## Exact next actions

1. Run documentation/repository-memory checks and commit this evidence
   checkpoint without repeating unaffected integration.
2. Push once, open one PR, require protected exact-head CI including the pinned
   Router `no-store` proof, collect one complete initial review and one
   confirmation review, then squash merge only after blockers are resolved.
3. Verify candidate-tree identity and exact-main CI before activating item67.

## Execution boundary

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Never create a `codex/` branch.
Docker server26.0.0 was reachable at the one bounded check. Preserve retained
media/databases and unrelated projects; all new integration resources use exact
fixture ownership and were removed.

## Do not do yet

Do not publish or merge item67 before item66 releases. Do not add GraphOS
credentials, a paid plan, APQ, a proxy,
hosted resources or forwarded client identity. Phase14 owns hosted provider and
deployment decisions.
