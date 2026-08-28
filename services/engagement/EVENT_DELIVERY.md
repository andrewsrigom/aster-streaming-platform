# Owned event delivery and recovery

P08-R09/R10/R12 candidate under [ADR-0034](../../docs/adr/0034-owned-event-delivery.md). [Real PostgreSQL](../../evidence/phase-08/events-postgres.txt) and [Kafka/owner observations](../../evidence/phase-08/events-runtime.txt) cover the implementation, including outage recovery. Corrected SIGTERM assertions pass against captured states/logs; the complete corrected supervisor still needs protected CI. Commands below are candidate operations, not a hosted release claim.

## Ownership and bounds

Identity, Catalog and Engagement relay their own committed outboxes from their existing processes. Request credentials are unchanged; separate local relay logins have only owner claim/ack function execution. Engagement alone has a separate deletion/quarantine consumer login. No cross-owner SQL or new service is used by production code.

A relay claims one lowest-pending aggregate version using a ten-second database-clock lease and random fencing token. It commits before Kafka publication. Only a successful broker acknowledgement and the same live token remove the pending row. Unknown sends/commits replay; late duplicates remain possible. One step per owner, no queue, one-second idle polling and failed-step backoff capped at five seconds. SQL operations have one-second deadlines; broker calls two seconds and at most two attempts. Shutdown cancels work and closes the owned pools/consumer.

| Topic | Producer | Key | Current consumer |
|---|---|---|---|
| aster.identity.profile.v1 | Identity | Profile ID | Engagement deletion handling |
| aster.catalog.publication.v1 | Catalog | Title ID | Planned Discovery projection |
| aster.engagement.v1 | Engagement | Progress or Watchlist aggregate ID | Future approved aggregate consumers |

Local topics use one partition/replica, one-hour/16-MiB retention, 16-KiB message admission and no auto-creation. Initialization creates only these topics and refuses incompatible existing partition/retention settings; it never silently alters retained topics. A single replica is not a broker-loss durability guarantee. Hosted replication, ACLs/TLS, restore and retention sizing belong to Phase 14.

## Migration and activation

Identity 0003, Catalog 0009 and Engagement 0003 add the lease, ordered index and restricted relay functions. Engagement 0004 adds permanent deletion audit/fences and bounded quarantine functions. No product backfill or source-event rewrite is required. DDL has one-second lock waits; relay migrations use two-second statement limits, deletion migration three seconds. Index creation scans the local bounded outboxes; this is not a large-table online-migration certification.

Drain old Identity/Catalog/Engagement processes before migration. Old finite migrators and Engagement readiness can reject the new ledger, even though the tables are additive. Keep a verified backup and compatible images; do not run old initializers against the new schema. The new initializers provision the narrow local logins without changing request-role grants or existing passwords.

For the fixed local project `aster`, after draining those owners:

```sh
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/events.yml --profile runtime build identity identity-init catalog catalog-init engagement engagement-init router-trust-init
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/events.yml --profile runtime up --no-build --wait --wait-timeout 120 broker
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/events.yml --profile runtime up --no-build --no-deps --exit-code-from broker-init broker-init
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/events.yml --profile runtime up --no-build --wait --wait-timeout 120 identity catalog engagement
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/events.yml --profile runtime restart --timeout 15 router
```

The explicit overlay enables events; base browsing/playback remains broker-independent. Refresh the Router after replacing owner containers so it reconnects to their current local endpoints, then confirm a federated sign-in before testing event delivery. This activation has a local maintenance interruption; it is not a rolling hosted upgrade. Event delivery does not become a public request-readiness dependency. A broker outage retains pending facts and ultimately reaches the existing finite owner outbox backpressure, never an acknowledged lost save or a fabricated empty read.

The trust initializer creates a separate private 32-byte Identity-event key, retaining a valid existing file. Only Identity/Engagement mount it read-only. HMAC-SHA256 binds purpose, topic, partition key and exact envelope bytes. Router/viewer/private-read credentials cannot substitute for this key. Never print or copy it into evidence.

## Deletion and projection recovery

The consumer verifies signature, bounded headers/value and exact v1 envelope before any destructive action. Created/updated facts do not create an Identity read model. Deletion locks the same guard as request writers; it permanently fences the profile and atomically removes progress, receipts, watchlist and pending Engagement events, recording source event/version and removal counts. A racing writer either commits before cleanup or observes the fence. A duplicate deletion has no second effect; old facts cannot recreate owned state.

Already-published/in-flight facts may survive until broker retention. Downstream consumers must honor deletion rather than rebuild personal authority from those facts. At most 1024 permanent profile guards, including tombstones, are retained; full capacity leaves consumption uncommitted. Do not evict a deletion fence to recover admission.

Continue-watching is a bounded query over authoritative progress plus current Catalog visibility, not a duplicated event projection. Reconstruct it by reopening that read against unchanged source state; the real SQL proof checks identical keys/status after reconnection and relay. Broker replay is not required for this view. Recovery beyond broker retention and future Discovery snapshots are not claimed here.

## Trigger, diagnosis and mitigation

Use this procedure when `aster.events.relay_state` remains degraded, owner outbox admission returns backpressure, or `aster.engagement.identity_event` reports retry/quarantine. Public media can remain available while saves or cleanup are delayed.

1. Inspect only the selected project's owner/broker/init status and bounded logs. Publication/consumption logs expose validated event/correlation IDs and finite outcomes, not payloads, cookies, profile IDs or signing headers. Existing dependency telemetry records publish/consume outcomes; no lag dashboard or SLO is claimed.
2. With authorized owner/maintenance access, inspect pending counts and the owner relay lease, not event payloads. For Engagement inspect deletion completion counts and quarantine ID/topic/partition/broker_offset/reason. The request and relay logins intentionally lack arbitrary maintenance privileges.
3. Repair the failed broker/SQL dependency or topic configuration without deleting outboxes. After recovery, verify pending counts drain, required deletion audits exist, consumer lag converges and public playback still succeeds. A zero outbox count alone does not prove consumer completion.
4. For a permanent invalid source fact, preserve it and investigate the producer contract; do not edit the event to force an acknowledgement. Full quarantine, missing key or conflicting source identity requires scoped operator investigation. Escalate unresolved data/trust conflicts to the owning context.

## Exact quarantine replay

Quarantine is private and limited to 128 records. Each record retains its exact topic/key/value/headers/partition/offset with an 8192-byte value ceiling and bounded headers. The consumer commits the Kafka offset only after durable deletion, duplicate recognition, ignored valid facts or durable quarantine. Oversized records, unavailable storage and full quarantine remain uncommitted.

Inspect one quarantine ID and resolve its underlying cause first. Replay preserves the original bytes and re-runs the same signature/contract/transaction checks. It neither edits payloads nor resets offsets. The record is removed only after durable successful handling; a duplicate completion is safe. Invalid or unavailable replay exits nonzero and retains the record.

```sh
QUARANTINE_ID='<exact inspected UUID>'
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/events.yml --profile runtime exec -T --env ASTER_EVENT_REPLAY_ENABLED=true engagement node ./dist/src/replay-identity-event.js "$QUARANTINE_ID"
```

Never replace a missing signing key blindly while signed backlog or quarantine exists. Stop affected consumers, restore the correct protected key and verify exact-record replay; hosted key rotation is a separate Phase 14 procedure.

## Rollback and cleanup

Disable background delivery by recreating the three owners from the compatible current base model without the events overlay, using `up --no-build --no-deps --wait identity catalog engagement`, then restart the selected project's Router and confirm federated access. Stop the event broker/init separately if no selected-project consumer needs them. Preserve schemas, audit, outboxes, broker log and the Identity event-key volume. Disabling delivery is not reversal of already-completed deletion.

Down migrations are empty/idle-state only. A non-null claim token, including an expired uncertain claim, prevents relay downgrade. Engagement 0004 refuses deletion/quarantine/fence data and later versions. Prefer compatible code or roll-forward; never delete state to make a downgrade pass.

The general local reset helper deliberately refuses this new overlay until its full-demo integration is reviewed. Do not bypass that refusal with broad prune/down-volume commands. Normal stop/down without volume deletion retains data. The integration supervisor alone uses `engagement-events-proof.yml` to label its unique fixture's broker/key volumes disposable; it validates exact project, service, mount, attachment and authority before cleanup. That overlay must never be used with retained data.

## Verification

`pnpm engagement:integration` includes the real owner SQL proof. `pnpm engagement:runtime` includes the candidate Kafka flow in the same isolated owner runtime: pre-activation backlog, actual signed deletion, uncommitted redelivery with one effect, retained contract/key checks, poison quarantine, exact replay CLI, committed offsets, broker stop/start, pending-save recovery and graceful shutdown. Both commands reject arbitrary targets. Review raw evidence and current candidate status before treating this procedure as verified.
