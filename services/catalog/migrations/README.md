# Catalog migrations

Migration 0001 creates Catalog-owned titles, immutable rights revisions and actor/time/correlation provenance. Migration 0002 adds optional metadata for existing drafts, immutable command/metadata audit, trusted publication attestations, receipts and publication outbox. No existing metadata is invented or backfilled.

The runtime role can update title lifecycle/metadata and insert history, audit, receipts and outbox. It cannot change/delete history, audit or outbox, write technical attestations, create schema objects or read Identity data. Only expired receipts are deleted by the owning application. The separate local initializer uses administrator credentials; the operator CLI requires the restricted aster_catalog_local login and probes privileges before use.

Rights append advances version/latest revision and writes facts/provenance atomically. Workflow commands use one title lock and one transaction; the metadata/lifecycle update accounts for that single version increment. Owner foreign keys prevent substituting another title/review's publication. Audit retains metadata/artwork rights snapshots. Receipts and outbox refer to the corresponding title-version audit.

Unique bounded slot columns enforce at most 64 receipts and 128 pending events/title even if callers race. The application reserves each final slot for takedown. No broker relay or background cleanup is implemented here.

Source rights/metadata JSON is limited to 30000 UTF-8 bytes, stored JSONB to 32768. Parameters are split without breaking surrogate pairs to preserve the shared adapter's 4096-character limit. Rights history reads use descending keysets up to 50 entries.

The initializer takes an advisory lock, validates contiguous versions, applies forward migrations once and refuses unknown schemas/unsafe local roles. Each migration has a one-second lock timeout and two-second statement timeout. Duplicate raw installation fails; the initializer is idempotent. Existing retained demo data has not been migrated by this work.

Rollback scripts are destructive and only for explicitly disposable fixtures: down 0002, then down 0001. They omit CASCADE; unexpected dependencies prevent removal. Down 0002 discards new metadata/audit/receipts/outbox and removes attestation ownership constraints; it is not a production rollback. After actual publication, use backups and roll-forward, or retire through the owning command. Never delete rights/audit or pending events to recover capacity.

The [operator guide](../README.md) documents startup and commands. [Integration evidence](../../../evidence/phase-03/README.md) covers fresh installation, down/up, role isolation and transaction behavior on local PostgreSQL, not an online production migration.
