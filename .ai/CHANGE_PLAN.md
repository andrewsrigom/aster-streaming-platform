# Work Item: Bounded GraphQL Execution, Rate and Cache Scope

- Status: IN_PROGRESS
- Owner: Platform and Identity
- Phase: 13
- Requirement IDs: P13-R06, P13-R11
- Created: 2026-08-31
- Updated: 2026-08-31

## Outcome

Every admitted GraphQL operation has an explicit authorization/cache class and
inherits bounded execution and concurrency. Identity profile commands admit
traffic by the currently authorized account through a bounded local-plus-Redis
limiter. Redis loss degrades admission without becoming identity authority or
making the owner unready. Private responses cannot enter a shared response
cache.

## Current behavior

Item65 is released through tree-identical PR55 squash main `8cd6c0b` and
exact-main run `33425758870` attempt2. Apollo Router already bounds public
execution to three seconds and eight concurrent requests, owners have shorter
outbound/subgraph deadlines, and every admitted GraphQL response is `no-store`.
The pre-service oversized-body rejection contains no data, explicit freshness
or validators. Apollo
Server response/document caches are disabled. Engagement already proves an
authorized-account Redis limiter with bounded local degradation, but Identity
profile commands currently have only process-global admission and Identity
incorrectly treats Redis readiness as critical.

## Proposed behavior

Generate one finite runtime policy beside the trusted-operation demand
profiles. It classifies every exact current/retained operation as public,
account or profile scoped, assigns a reviewed rate class, and requires
`no-store`. Generation fails when an operation lacks policy or private behavior
is classified public. Keep Router's three-second/eight-request boundary and
prove its relation to owner deadlines.

Decorate Identity profile mutations after authoritative session restoration
with account-partitioned token buckets. Validated durable mutation IDs plus
canonical request digests identify exact create/update/delete retries without
deduplicating conflicting payloads; selection uses a fresh identity. One
versioned Redis script uses server time for cross-replica coordination. Its
bounded decision precedes the outage-only local path so a retry is not hidden by
one process's exhausted fallback bucket. Redis rejection rejects. Redis timeout
or outage uses only 1,024 local partitions and 8,192 short-lived admission
markers. Cancellation never falls back to allow. PostgreSQL remains Identity's
sole readiness-critical dependency.

## Boundaries

- Owning context: Platform owns public operation classification; Identity owns
  session authorization, profile commands and their admission.
- Affected services/packages: `@aster/router`, `@aster/identity`, telemetry,
  runtime/configuration verification, CI policy and Phase13 documentation.
- Authoritative data: Identity PostgreSQL and current session validation remain
  authoritative; Redis and generated policy never authorize durable data.
- Read models/caches: existing public Catalog/Discovery source caches remain
  public-only; DataLoader remains request-scoped; private Apollo state remains
  session-scoped and is discarded on session/profile change.
- Trust boundaries: cookies, GraphQL documents/variables, operation metadata,
  Redis contents, clocks and dependency responses are untrusted.
- External dependencies: existing pinned PostgreSQL, Redis, Router and Node
  dependencies only; no GraphOS account, proxy, service or hosted resource.

## Invariants

- Owner authorization precedes identity-aware admission and is repeated by the
  existing command path before the write.
- Raw cookie, account/profile ID, query, hash and variables never enter Redis
  keys, public errors, logs or metric labels.
- Limiter work runs outside PostgreSQL transactions and cannot authorize a
  profile mutation.
- Bounded local partitions/admission markers and Redis TTLs prevent unbounded state.
- Redis failure cannot make durable identity state incorrect or Identity
  readiness fail.
- Cancellation, local capacity exhaustion and malformed dependency replies fail
  closed.
- All exact admitted operations have one runtime/cache policy; their responses
  are `no-store`. The pre-service body rejection has no reusable cache metadata;
  private data never enters shared response caching.
- Router execution/concurrency bounds supplement owner deadlines and do not
  replace authorization, pagination or dependency bounds.

## Failure behavior

| Failure | Expected behavior | Telemetry |
| --- | --- | --- |
| Account exceeds profile command budget | Reject before mutation | finite operation/result/source |
| Redis rejects | Reject consistently across replicas | `redis` plus `rejected` |
| Redis times out or is unavailable | Use bounded local result; keep Identity ready | `local_fallback` plus finite cause |
| Redis reply/key is malformed | Fail closed or bounded fallback; never authorize | finite dependency failure |
| Local partition map is full | Reject new partition | finite `capacity` outcome |
| Request is cancelled | Reject/cancel without fallback allow | finite `cancelled` outcome |
| Operation lacks runtime/cache policy | Composition fails | operation name plus finite rule |
| Private operation is marked public/cacheable | Composition fails | finite scope rule |
| Public concurrency or deadline is exceeded | Router returns sanitized bounded failure | existing finite server outcome |

## Data and contracts

- Schema/migration: none.
- GraphQL: no field/type change; existing `LIMIT_EXCEEDED` outcome is reused.
- Events: none.
- Cache: versioned SHA-256 account partitions, finite TTL, all GraphQL responses
  `no-store`; no durable source-of-truth cache.
- Compatibility: existing first-party operations and demo behavior remain
  compatible below the reviewed limits.
- Retention/deletion: limiter state expires automatically and contains no raw
  identifier; profile/session deletion behavior is unchanged.

## Security and privacy

- Authorization: current signed session is restored by Identity before account
  partition selection; owner command validation remains authoritative.
- Input limits: existing Router/owner body, parser, list, deadline and
  concurrency bounds remain; limiter partitions and admission markers are
  finite.
- Sensitive data: only SHA-256 pseudonyms enter Redis keys; session cookies and
  signed media URLs remain absent from telemetry and cache artifacts.
- Abuse cases: one account hot-spots profile mutations, cross-account collision,
  repeated/replayed admission, Redis outage, forged forwarded identity, cache
  scope confusion, cancellation and capacity exhaustion.

## Implementation steps

1. Record ADR-0047 and exact generated runtime/cache policy coverage.
2. Implement Identity profile-operation limiter, decorator and telemetry.
3. Make Redis optional for Identity readiness and prove degraded operation.
4. Add deterministic unit, contract and real Redis/PostgreSQL integration tests.
5. Generate evidence, update security/GraphQL/operations documentation and run
   the affected candidate gate.
6. Publish one coherent candidate; complete one initial and one confirmation
   review; merge only after protected exact-head CI.

## Tests

- Domain: deterministic token refill, burst, independent account partitions,
  capacity and clock/reply validation.
- Application: authorization-before-admission, rejection blocks command,
  revalidation stays in the base command, cancellation and telemetry.
- Integration: real Redis atomic decisions/outage recovery plus real PostgreSQL
  readiness with Redis absent.
- Contract: one runtime/cache classification per exact trusted hash; private
  operations cannot be public/cacheable; generated artifact staleness fails.
- Browser: canonical sign-in/profile/browse/play journey remains valid; private
  Apollo state still resets on session/profile changes.
- Performance/failure: deterministic eight-active/one-rejected concurrency
  proof, three-second Router/shorter owner deadline verification and bounded
  Redis outage behavior.

## Evidence

- Commands: focused Identity/Router tests during iteration; affected candidate
  gate before publication; protected CI for real packaged runtime.
- Raw artifact path: `evidence/phase-13/execution-rate-cache-controls.txt`.
- Acceptance result: corrected local candidate accepted at source `8d2633d`,
  tree `d75aca0`; Identity159/159, Router21/21, focused verifiers, all11 real
  integration scenarios, isolated packaged Router and affected gate57/57 pass.
  Corrected protected CI, discussion resolution, confirmation and release are
  pending.
- Iteration gate: changed-package typecheck/lint plus focused unit/contract tests.
- Candidate gate: repository affected-scope gate selected from exact diff,
  including Identity integration, Router generation and platform policy.
- Heavyweight repeat triggers: repeat container/browser/runtime evidence only if
  Identity lifecycle, Redis script, Router config/artifact, Web cache/session
  behavior or shared Compose/runtime wiring changes after the last proof.
- Review stopping rule: collect one complete initial review, batch blocker
  remediation, then one confirmation; reopen only for a changed blocking
  security/data/availability/public-contract boundary.

## Rollback or recovery

Revert ADR/policy generation and the Identity decorator/optional-Redis wiring as
one item. No schema, database, event or media migration exists. Reverting leaves
the released global Router execution/concurrency controls and global Identity
shield intact. If Redis policy is faulty, disable only the new decorator through
source rollback; never delete durable Identity data or retained Redis globally.

## Documentation updates

- ADR-0047 and decisions ledger.
- GraphQL, security, Redis/degraded-mode and Identity operational documentation.
- Phase13 evidence index and `.ai/` state/session/handoff.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
