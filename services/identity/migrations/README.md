# Identity account/session migration

Migration 0001 adds the Identity-owned `identity.accounts`, `identity.sessions` and version ledger, plus a non-login runtime privilege role. It does not alter the released health-only startup. Product transport and automatic local startup migration are still planned.

The account key is unique by verified issuer/subject. Session IDs and signer generation IDs are UUIDs; credentials are stored only as SHA-256 digests. Eight numbered slots and a unique `(account_id, slot)` constraint enforce the per-account storage bound. Application admission also locks the account before cleanup/count/insert. Expired or obsolete-signer sessions are reclaimed on sign-in. Deleting a session revokes it; no durable tombstone or implicit renewal exists.

## Compatibility and ownership

This is an additive first migration with no backfill. Apply it once using the database migration owner, before wiring product traffic. The owner needs role/schema creation privileges; runtime credentials must not have them. Provision a separate login and grant it membership in `aster_identity_runtime`; never run product sessions with the migration owner's credentials. The runtime role can select/insert accounts and select/insert/delete sessions. Column-level `UPDATE(created_at)` permits PostgreSQL row locking without granting changes to account identity keys. It cannot modify the migration ledger or create schema objects.

SQL files wrap their changes in one transaction. Lock waits are limited to one second and individual statements to two seconds. Use a finite connection/client deadline and stop on the first SQL error when applying them. Existing tables are not scanned or rewritten by the forward migration; DDL locks concern only the new objects. A duplicate application fails atomically instead of silently accepting schema drift. No hosted migration runner is implemented.

## Reproducible verification

From the repository root, with the pinned toolchain installed and local Docker available:

```sh
pnpm exec turbo run build --filter=@aster/identity
pnpm --filter @aster/identity integration:sessions
```

The supervisor creates a unique, labelled PostgreSQL/Redis fixture with loopback-only ports. The worker applies the real SQL, provisions synthetic test-only runtime credentials, proves privilege denial, concurrent account resolution/session limits, rollback, expiry, revocation and database recovery, then checks backward/forward migration. Cleanup validates every owned resource and removes only that disposable fixture. The full `pnpm integration` matrix includes this scenario. No running local Aster database or unrelated Docker project is migrated or reset by this command.

## Rollback and recovery

Stop product traffic and close runtime connections before rollback. The `0001-accounts-sessions.down.sql` file permanently removes all accounts, sessions and this migration ledger. Use it only for explicitly disposable local data or a separately authorized recovery with a verified backup. It is not an automatic shutdown action.

Rollback uses restrictive drops without `CASCADE`; later dependent objects make it fail atomically. Once later migrations or durable product data exist, prefer a reviewed roll-forward or reverse dependent migrations first. Reapplying the forward migration after successful rollback creates empty tables and a new privilege role; login membership must be provisioned again. Reverting application code alone leaves this additive schema intact.

The runtime transaction adapter gives one lease one total operation budget (two seconds by default, including acquisition), at most 32 sequential statements, 32 bound parameters, 4096 characters per bound string and 64 rows per statement. SQL is source-owned and concrete queries/schema constraints bound results; these limits are not a SQL parser or an API for client SQL. Commit acknowledgment loss is `indeterminate`, never automatically retried. Callers receive no credential on an unknown sign-in commit; an undisclosed row remains bounded and expires.

See [ADR-0013](../../../docs/adr/0013-local-identity-and-sessions.md), [Phase 02 evidence](../../../evidence/phase-02/README.md) and [PostgreSQL row-lock privileges](https://www.postgresql.org/docs/18/sql-select.html).
