# ADR-0030: Local owner-authorized Engagement progress

- Status: Accepted
- Date: 2026-08-28
- Owners: Engagement, Identity and Playback
- Requirements: P08-R01–P08-R05, P08-R09, P08-R12

## Decision

Keep PostgreSQL as Engagement authority and the supergraph as public API. Identity verifies the current browser session and requested profile; Playback verifies the referenced session/title. A valid anonymous playback session is a title-bound context, not proof of viewer identity: progress ownership comes independently from Identity. Do not mutate Playback's anonymous profile binding or make anonymous playback depend on Engagement.

Following ADR-0027, add purpose-separated private GraphQL reads in the two owners with distinct random 256-bit local file credentials, never their Router credentials. Hide these contracts from public composition with `@inaccessible`, but enforce the exact private operation and credential at the owner; the directive alone is not authorization. Forward the bounded browser credential only to Identity, never Playback or event storage. No recursive public Router request, foreign-owner SQL or cross-request authorization cache. Each read propagates cancellation, correlation and trace, with a two-second adapter ceiling inside the 2.5-second Engagement application budget; HTTP/subgraph use 2.7 seconds inside the Router's three seconds.

Owner snapshots may be at most two seconds old and not future-dated. Writes expire at the earliest owner/session deadline; SQL rechecks that window. This is bounded local authorization, not an atomic transaction with Identity deletion or retroactive revocation of issued media. Reads/replays still require current profile authorization. Check an existing receipt before looking up Playback so accepted replay survives the original session's expiry or Playback outage. Recheck the receipt after locking to handle races.

## Persistence and bounds

Use an isolated Engagement schema and runtime login with no other-owner/schema/role privileges. Profile guards retain only verified account/profile references and a deletion fence, never authoritative Identity preferences. Serialize writes on the guard row, then update the (profile, title) aggregate. A small admission row serializes only creation of a previously unseen guard; independent existing profiles can write concurrently. Acquire locks in this order consistently. SQL also rejects non-increasing sequences, wrong version increments and changed aggregate ownership.

Local ceilings: 1024 guard rows (including deletion fences), 256 progress aggregates per profile, 1024 unexpired receipts per profile, and 1024 pending outbox rows per profile. Enforce bounded unique slots in SQL; do not evict acknowledged progress to create room. Full capacity returns backpressure. These are conservative local limits, not measured production throughput or hosted sizing.

Receipts live for one hour; prune at most 64 expired entries per mutation. Same key/payload within that window returns its original accepted result; a changed payload conflicts. After expiry, a stale sequence still cannot repeat an effect. Keep authoritative progress/history until profile deletion, subject to the explicit finite title ceiling; do not silently delete history. Pending outbox facts remain until acknowledged relay or explicit profile-deletion handling, with backpressure during a long broker outage. Relay/deduplication and deletion/rebuild acceptance remain later Phase 08 work, not implemented by this ADR.

State, receipt and progress-recorded v1 event commit together. A deferred constraint checks their matching aggregate/version at commit. Unknown COMMIT is indeterminate and only the same-key retry is safe. The later deletion consumer locks the same guard, marks a non-reversible tombstone and removes owned data; a racing writer either commits before cleanup or observes the fence. Existing guards are not reused for another account. Do not discard deletion fences through ordinary retention.

## Verification and recovery

Require real PostgreSQL ordering/replay, synchronized concurrent attempts, missing receipt/event rejection, role isolation, capacity, cancellation/lock deadlines, migration round-trip and refusal to drop retained data. Require actual owner credential/expiry/substitution tests before exposing the subgraph. Unit fakes alone prove neither deployed authorization nor durability. Rollback stops the additive runtime and retains schema/data; down migration is empty-state only. Hosted service identity, TLS, distributed clock policy and measured capacity remain Phase 14 responsibilities.

## Sources and alternatives

The existing [data ownership](0004-data-ownership.md), [outbox](0007-events.md), [Identity](0013-local-identity-and-sessions.md) and [private-read](0027-local-playback-sessions.md) decisions remain unchanged. [Apollo's directive reference](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/reference/directives#inaccessible) supports excluding owner fields from the API schema. PostgreSQL's [row-lock semantics](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) and [deferred constraint triggers](https://www.postgresql.org/docs/18/sql-createtrigger.html) support transaction-local enforcement. Checked 2026-08-28; limits and snapshot policy are Aster choices. Redis authority, public identity headers, direct broker dual-writes and one global lock on every progress update are rejected.
