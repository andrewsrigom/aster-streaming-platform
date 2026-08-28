# ADR-0034: Owned event delivery and profile-deletion cleanup

- Status: Accepted
- Date: 2026-08-28
- Owners: Identity, Catalog, Engagement
- Requirements: P08-R09, P08-R10, P08-R12

## Decision

Activate the existing Identity profile, Catalog publication and Engagement progress/watchlist outboxes. Each owner runs a bounded background relay in its existing process. A shared event-delivery package contains mechanical ports, envelope/wire validation and relay execution for these three concrete outboxes; product rules and SQL migrations remain owned. No new service or authoritative store.

Claim one pending event in a short PostgreSQL transaction using an owner-local singleton lease, a random fencing token and ten-second database-clock expiry. Select the lowest pending version per aggregate before later versions. Publish outside SQL using the aggregate ID as Kafka key. Only a successful broker acknowledgement permits the matching live-token SQL acknowledgement to remove that exact pending row. Unknown sends/commits retain or replay the same event; late duplicates are possible and consumers must not regress. No global ordering or exactly-once claim.

Separate local relay roles execute narrowly granted claim/ack functions, not arbitrary outbox DELETE or product UPDATE. Functions use fixed pg_catalog/pg_temp search paths and qualified owner tables. Existing request-role grants stay unchanged. Owner migrators add the functions/lease and compatible indexes. SQL operations use the existing one-second bounded adapter; broker operations have a two-second budget, at most two idempotent-client attempts. One relay step at a time, no queue; idle polling one second, failed steps back off to five seconds with bounded jitter, cancelled on shutdown. A permanently invalid owner fact stays pending and reports a finite failure for operator repair.

Explicitly initialize aster.identity.profile.v1, aster.catalog.publication.v1 and aster.engagement.v1. Local single-partition/replica topics retain the existing one-hour/16-MiB limits. Disable auto-creation. The consumer opts into earliest retained offsets when its group has no valid committed position; retain the adapter's existing default for other callers. Manual offset commit follows durable handling. Broker unavailability affects delivery/backpressure, not anonymous media or already committed progress.

Runtime recovery correction: Kafka consumer rebalance waits use half the adapter operation budget (one second locally), leaving time for the remaining join/start work inside the unchanged two-second deadline. KafkaJS's sixty-second default caused repeated timed-out joins in the real broker outage proof. Keep its thirty-second heartbeat-session detection; this is not a one-second failure-detection promise. A recovering inbound consumer does not prevent its owner's independent outbox step; preserve failed-step backoff even when that step publishes successfully. Verify actual consumer recovery as well as a drained outbox.

## Destructive-event trust

Keep the v1 JSON envelope unchanged. Add bounded Kafka header support: at most eight names, 64 ASCII characters/name, 1024 bytes/value and 4096 total bytes. The Identity relay signs topic, aggregate key and exact value bytes with purpose-separated HMAC-SHA256; its signature uses one aster-identity-event-signature header. The existing finite trust initializer creates a separate private 32-byte key volume mounted only by Identity and Engagement. Do not reuse Router/session/read credentials or expose the key to Catalog, Playback, Web or the broker.

Engagement checks that signature before interpreting any Identity fact, then validates exact envelope, producer/type/version, UUIDs, trace, payload and matching partition key. Local HMAC is an environment-scoped trust boundary, not hosted broker authentication or an encryption claim. Hosted ACLs, TLS and rotation remain Phase 14. Stop affected consumers and preserve retained signed messages during local key recovery; blind key replacement is not a replay procedure.

## Deletion and recovery

Engagement's first real consumer handles Identity profile facts. Created/updated facts cause no duplicate Identity read model. A valid deletion locks the same profile guard as progress/watchlist writers, checks account identity, records the source event/version, makes the tombstone permanent and removes owned progress, receipts, watchlist state and pending Engagement outbox rows in one transaction. Record completion time and bounded removal counts. This explicit cancellation of not-yet-relayed personal facts refines the deletion exception already accepted in ADR-0030. An already in-flight/brokered duplicate can survive until broker retention; downstream consumers must honor deletion, not recreate authority from old events.

Permanent guards remain under the existing 1024-profile ceiling. Same event/version has no second effect; older facts cannot resurrect deleted data; conflicting source identity/version is rejected. Quarantine at most 128 private records, each at most 8192 value bytes plus bounded key/signature/position and finite reason. Store poison durably before advancing its offset. Full quarantine or unavailable persistence leaves the offset uncommitted. An operator replays one exact retained quarantine record through the same validation/transaction path and removes it only after successful durable handling; no blind offset reset or payload editing. Protocol-oversized records remain uncommitted for scoped operator investigation.

Continue-watching is already derived from authoritative Engagement progress plus current Catalog visibility. Prove that rebuilding the query result from unchanged durable source reproduces its keys/status; do not add a redundant self-consuming projection. Discovery's later consumers and hosted retention recovery are not implemented here.

## Verification and rollback

Require focused codec/order/ambiguity tests, real PostgreSQL role and claim races, consumer/write races, duplicate/old/poison/replay behavior, real Kafka backlog/outage/redelivery and lifecycle evidence. Stop delivery and retain state for rollback; never undo deletion fences or drop pending facts. Additive migration compatibility and exact down/roll-forward conditions belong to each owner's migration guide. This ADR accepts the design; implementation/evidence remain in the active work item.

Checked 2026-08-28: [KafkaJS consumption](https://kafka.js.org/docs/consuming) describes initial offsets and explicit commits; [production](https://kafka.js.org/docs/producing) describes keyed delivery and idempotent producers. [PostgreSQL function security](https://www.postgresql.org/docs/18/sql-createfunction.html) supports restricted execution and safe search paths. [Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptocreatehmacalgorithm-key-options) supplies HMAC and constant-time comparison; the installed Node version remains pinned. Exact bounds, schema, trust and failure policies above are Aster decisions.
