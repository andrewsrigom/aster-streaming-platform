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
from exact main `8cd6c0b`. Initial source `a090285`, tree `98d3064`, passed its
candidate gate; evidence head `59b7215`, tree `ee1c908`, opened PR56. Protected
run `33432579598` failed and initial review found one blocker. Corrected source
`8d2633d`, tree `d75aca0`, reached published head `82ba630`, passed protected run
`33437257163` and resolved discussion `3897861197`. Confirmation discussion
`3898385895` found the 30-second marker expires before the 86,400-second durable
receipt. Second corrected source `bf14e2c`, tree `0084c67`, is committed and
locally accepted. It is not pushed, confirmed or released yet.

## Implemented locally

- ADR-0047 records bounded GraphQL execution, account admission and cache scope.
- Operation-demand manifest version2 classifies all25 current/retained exact
  hashes as public/account/profile, assigns finite rate classes, pins the Router
  3,000 ms/eight-request boundary and requires `no-store`.
- Composition derives minimum private scope from selected owner coordinates and
  fails missing/stale/weaker policy.
- Router's GraphQL service overwrites admitted responses with
  `Cache-Control: no-store`; the pre-service body rejection must be data-free
  without reusable freshness or cache validators.
- Identity create/update/delete use `profile_mutation` (8 burst,2/s); selection
  uses `profile_selection` (16 burst,4/s). A current session supplies the
  authoritative account partition, then the existing profile command repeats
  authorization before writing.
- Create/update/delete first validate and authorize the canonical request and
  read its retained PostgreSQL receipt. Exact durable replay or changed-payload
  conflict returns before admission. Missing receipts bind admission to the
  validated mutation ID plus canonical request digest; selection uses a fresh
  admission identity.
- The limiter has at most1,024 local partitions and8,192 expiring local
  admission markers. Redis uses its existing atomic server-time bucket with
  30-second TTL and only SHA-256 account/admission pseudonyms. The shared
  decision runs before outage-only local admission; cancellation/capacity fail
  closed.
- PostgreSQL is Identity's sole readiness-critical dependency. Redis remains
  lifecycle-owned and closes cleanly.
- Telemetry accepts finite `profile_mutation` and `profile_selection` labels.

## Current evidence

- Initial protected run `33432579598` failed the Identity subgraph readiness
  assertion and Router startup because a static response-header YAML shape was
  unsupported. Its real fixture cleaned remaining0.
- Initial review discussion `3897861197` found fresh admission could block
  durable receipt replay. Corrected protected head `82ba630` passed run
  `33437257163`, and that thread is resolved. Confirmation discussion
  `3898385895` found the marker/receipt lifetime mismatch.
- Second corrected source is `bf14e2c`, tree `0084c67`.
- Identity tests:162/162 pass.
- Router tests:21/21 plus deterministic schema check pass.
- Telemetry tests:19/19 pass.
- Router source verifier:5/5 pass.
- GraphQL rejection/cache verifier:3/3 pass.
- Build:15/15 relevant dependency/package tasks pass.
- `pnpm --filter @aster/identity integration:core` passed four disposable
  scenarios in58.870s: real atomic two-replica Redis admission, Redis outage
  fallback/recovery, PostgreSQL/optional-Redis readiness, cancellation/capacity,
  SIGTERM/HTTP drain and cleanup remaining0.
- Raw checkpoint:
  `evidence/phase-13/execution-rate-cache-controls.txt`.
- Full `pnpm integration`: all11 scenarios passed again in142.098 seconds on the
  second correction; exact project cleanup remaining0. Exact committed source
  repeated the real subgraph in18.137 seconds with bucket exhausted, marker
  removed, durable replay passing, no marker recreation and cleanup remaining0.
- Isolated `aster-p13-remediation` packaged Router proof passed accepted/adverse
  cache behavior and removed its owned resources.
- Final second corrected affected candidate gate:57/57 tasks,46 cached,61.880
  seconds on source `bf14e2c`/tree `0084c67` plus current evidence/documentation.

## Exact next actions

1. Push the second corrected evidence head once to existing PR56.
2. Require protected exact-head CI including the pinned Router `no-store`
   proof. Answer/resolve discussion `3898385895`, then request one
   blocker-focused confirmation review on the second corrected exact head.
3. Squash merge only after those gates. Verify candidate-tree identity and
   exact-main CI before publishing item67.

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
