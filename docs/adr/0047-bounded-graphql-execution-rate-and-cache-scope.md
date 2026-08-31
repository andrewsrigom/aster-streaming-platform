# ADR-0047: Bound GraphQL execution, account admission and cache scope

- Status: Accepted
- Date: 2026-08-31
- Owners: Platform and Identity
- Related requirements: P13-R06, P13-R11
- Supersedes: none
- Superseded by: none

## Context

ADR-0045 admits only exact reviewed operations and ADR-0046 proves their static
demand. Apollo Router already bounds a public request to three seconds and eight
concurrent executions; each owner applies shorter dependency deadlines. Those
global controls do not partition profile-command abuse by an authorized
account. Router Core's global rate limit cannot safely derive Aster's current
local account from an untrusted cookie or forwarding header. Router JWT claim
validation is relevant to a hosted trust boundary, but activation requires the
Phase14 identity/provider and GraphOS decisions.

All responses admitted to the Router's GraphQL service are `no-store`; Apollo
Server document, APQ and response caches are disabled. The fixed pre-service
oversized-body rejection contains no data, explicit freshness or cache
validators. Catalog and Discovery cache only public owner projections. Private
DataLoader and Apollo Client state are request/session scoped. These facts were
implemented separately and lacked one exact-operation contract that prevents a
future private operation from being treated as public or shared-cacheable.

Identity also treated Redis readiness as critical even though PostgreSQL and
current signed sessions are its only durable authorities. That contradicts the
platform invariant that Redis is non-authoritative and has a degraded mode.

## Decision

The versioned operation-demand manifest also carries one exact runtime policy
for every current and retained operation hash. Each entry records:

- authorization scope: `public`, `account` or `profile`;
- one finite rate class;
- public execution deadline of 3,000 ms;
- public concurrency maximum of eight;
- response cache policy `no-store`.

Generation traverses selected schema coordinates and derives the minimum
authorization scope. Identity account/profile roots require account scope;
Engagement roots and entity fields require profile scope. The declared policy
must match that derived scope. The policy name set must exactly equal the active
trusted-operation name set, including retained versions by name. Missing/stale
entries, public classification of private selections, a different response
cache policy, or drift from the pinned Router execution/concurrency limits fail
composition.

Identity profile create/update/delete share `profile_mutation`: capacity eight,
refill two requests per second and TTL 30 seconds. Profile selection uses
`profile_selection`: capacity sixteen, refill four per second and TTL 30
seconds. Sign-in, sign-out and reads retain the global Router/service controls;
sign-out is never blocked by the new limiter.

Before rate admission, the profile-command decorator asks the Identity owner to
validate the canonical create/update/delete input, authorize the current session
and read the retained durable receipt. An exact retained receipt returns its
original result without consulting the short-lived limiter; reuse of the same
`mutationId` with a different canonical request digest conflicts. Only a missing
receipt reaches account-partitioned admission. Its marker derives from the
validated `mutationId` and request digest, so concurrent or unsaved exact attempts
share the cross-replica decision. Selection has no durable receipt and keeps an
owner-generated marker. After admission, the existing profile application
revalidates and locks the session before any write. Admission happens between
completed PostgreSQL units of work and never inside a product transaction.

Redis uses one atomic versioned token bucket and a finite admission marker for
new or not-yet-durable attempts. The marker is never the source of a completed
mutation replay because its 30-second lifetime is shorter than the 86,400-second
durable receipt. Keys
contain a SHA-256 account pseudonym and admission digest, never the raw cookie,
account/profile ID or request correlation ID. The shared decision runs first so
an exact cross-replica retry remains replayable even when one process has a hot
local fallback bucket. The existing finite Redis adapter and GraphQL admission
bound command pressure. Redis rejection rejects. During Redis timeout or
unavailability, each process permits only its bounded local policy: at most
1,024 monotonic account-operation buckets and 8,192 short-lived admission
markers, including same-process retry deduplication. Cancellation never falls
back to allow; exhausted local capacity rejects. Redis state expires and never
authorizes a profile write.

PostgreSQL becomes Identity's sole readiness-critical dependency. Redis remains
owned and closed during shutdown, and limiter dependency telemetry exposes its
failure/recovery. Redis loss keeps Identity ready while commands use the bounded
local policy. PostgreSQL loss still removes readiness and new work admission.

## Consequences

### Positive

- Profile-command abuse is partitioned by a verified account without trusting a
  browser/header identity or adding a proxy.
- Cross-replica Redis coordination and process-local degradation are explicit,
  finite and testable.
- A new operation cannot silently inherit public/shared-cache semantics.
- Redis loss no longer advertises durable Identity as unavailable.
- Local Docker and CI remain reproducible without GraphOS credentials.

### Negative

- New mutations use one authorized read transaction to establish that no durable
  receipt exists, then repeat authorization in the authoritative write path.
  This is deliberate race-safe work within the existing bounded database pool;
  completed exact retries stop after the first read.
- Local fallback is per process, so aggregate degraded capacity can rise with
  replica count. Phase14 capacity/deployment policy must account for that finite
  multiplier.
- Admitted GraphQL responses remain `no-store`; the pre-service body-limit
  rejection remains data-free and carries no freshness or validators. Public
  response caching requires a future measured design with explicit variation
  and invalidation semantics.

### Security and privacy

Owner authorization remains mandatory and is repeated immediately around the
write. Limiter decisions cannot grant data access. Raw credentials, IDs,
queries, variables, hashes and signed URLs do not enter Redis keys, logs or
metric labels. Public errors retain finite existing outcome codes. Operation
classification is source/build metadata, never client input.

## Alternatives considered

### Partition Router rate limiting by forwarded identity

Rejected. The current local browser identity is a cookie owned by Identity;
forwarded account/profile headers are untrusted and Router Core's global limiter
does not provide that trust model.

### Enable hosted JWT claims immediately

Deferred to Phase14. It requires the hosted issuer, keys, account and deployment
boundary. It may supplement but cannot weaken owner authorization or this local
reproducible contract.

### Make Redis fail closed for all Identity readiness

Rejected. Redis is non-authoritative. A bounded local shield preserves useful
profile commands without risking durable correctness.

### Cache public GraphQL responses now

Rejected. Current owner-level public caches already target measured work. A
shared GraphQL response cache would add variation and invalidation semantics
without a current performance requirement.

## Validation

Unit tests prove burst/refill, partition isolation, 1,024-partition and
8,192-marker capacity, durable replay before rate admission, changed-payload
separation, pseudonymous keys, fixed
Redis policy, rejection, outage fallback, recovery, cancellation and closure.
Application tests prove authorization and durable receipt lookup precede
admission, rejection prevents the base mutation and reads bypass the limiter.
Composition tests require exact policy coverage, derived private scope and
`no-store` on all hashes. Identity runtime tests prove Redis is absent from
readiness while both dependencies remain owned for shutdown. Real Redis and
PostgreSQL failure evidence is captured in Phase13 before release. The real
subgraph proof exhausts the shared mutation bucket, removes the short-lived
Redis marker and still returns the retained PostgreSQL result without recreating
that marker.

## Migration and rollback

No GraphQL field, database, event or media migration occurs. Publish the
manifest version, Identity decorator/limiter and readiness change together.
Rollback restores manifest version 1 and removes the decorator while retaining
the released global Router/service controls. Do not delete durable product data
or globally flush Redis; versioned limiter keys expire naturally.

## Sources

- [Apollo Router traffic shaping](https://www.apollographql.com/docs/graphos/routing/performance/traffic-shaping)
- [Apollo Router rate limiting](https://www.apollographql.com/docs/graphos/routing/security/rate-limiting)
- [Apollo Router JWT authentication](https://www.apollographql.com/docs/graphos/routing/security/jwt)
- [Apollo Server cache control](https://www.apollographql.com/docs/apollo-server/performance/caching)
