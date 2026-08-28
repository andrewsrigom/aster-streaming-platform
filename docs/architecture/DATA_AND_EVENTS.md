# Data and Events

## PostgreSQL ownership

One PostgreSQL cluster may host the initial release, but each context receives:

- its own database or schema;
- its own migration history;
- its own database credentials;
- access only to its owned objects.

No service joins another context's tables.

## Primary data

### Identity and Profiles

- accounts;
- external identities;
- sessions or adapter records;
- profiles;
- profile preferences;
- audit events.

### Catalog

- titles;
- title localizations;
- credits;
- genres;
- rights records;
- assets and artwork;
- media publication references;
- lifecycle history;
- operator audit records.

### Playback

- playback sessions;
- publication projection;
- delivery-policy state;
- sampled playback events.

### Engagement

- watchlist entries;
- progress aggregate;
- idempotency records;
- viewing history;
- continue-watching projection.

### Discovery

- searchable title projection;
- rail definitions;
- title ranking projection;
- trending counters or aggregates;
- optional recommendation projection.

### Media worker

- processing requests;
- attempts;
- source probes;
- recipe versions;
- technical validation reports;
- output manifests.

## Transaction boundaries

A business use case writes its aggregate and outbox entry in one transaction.

Examples:

- publish title + `catalog.title-published.v1`;
- retire title + `catalog.title-retired.v1`;
- record progress + `engagement.progress-recorded.v1`;
- delete profile + `identity.profile-deleted.v1`.

Network calls do not run inside these transactions.

## Event envelope

```json
{
  "eventId": "uuid",
  "eventType": "catalog.title-published",
  "schemaVersion": 1,
  "occurredAt": "RFC3339 timestamp",
  "producer": "catalog",
  "aggregate": {
    "type": "Title",
    "id": "uuid",
    "version": 7
  },
  "correlationId": "uuid",
  "causationId": "uuid-or-null",
  "trace": {
    "traceparent": "optional"
  },
  "payload": {}
}
```

Events are facts in past tense. Commands are not published as domain events.

## Delivery semantics

Phase 08's current [owned-delivery candidate](../../services/engagement/EVENT_DELIVERY.md) implements bounded Identity/Catalog/Engagement relays and authenticated Engagement deletion/quarantine/replay. Its real SQL acceptance passes; Kafka/owner runtime and protected release remain pending. Continue-watching is reconstructed directly from durable progress and current Catalog visibility, not a second event-built store. The Discovery projections below remain planned.

The outbox plus broker provides at-least-once delivery.

Therefore:

- duplicates are expected;
- consumers store processed event IDs or enforce aggregate version;
- side effects use idempotency;
- ordering is guaranteed only within the selected partition key;
- poison events enter a quarantine flow with replay procedure;
- projections can be rebuilt.

## Progress ordering

The Engagement aggregate key is `(profile_id, title_id)`.

Each accepted client update includes:

- playback session ID;
- idempotency key;
- sequence number;
- position;
- duration observed;
- occurred-at time.

The durable write rejects a sequence not greater than the accepted sequence, unless the idempotency key identifies the already accepted request. Server receipt time does not override sequence ordering.

The domain clamps impossible positions and applies completion rules.

## Search and home projections

Discovery consumes Catalog events to build search and rail data. It consumes Engagement events only for aggregate signals that have been approved for that use.

A projection stores:

- source aggregate version;
- projection version;
- indexed time;
- source event ID.

Rebuild uses source snapshots or replay according to the release design.

## Retention

Retention is explicit per table and event stream. Operational telemetry is not a permanent product-event archive by default.

Profile deletion events trigger owned-data cleanup. Each consumer reports deletion completion or failure through auditable status.

## Backup and restore

Before release:

- PostgreSQL backups are automated;
- restore is tested into an isolated environment;
- object versions required by active publications are protected;
- Redis is not part of durable recovery assumptions;
- broker retention supports projected recovery targets;
- outbox replay behavior is tested.
