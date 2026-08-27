# Identity migrations and profile policies

Migration 0001 adds the Identity-owned `identity.accounts`, `identity.sessions` and version ledger, plus a non-login runtime privilege role. Phase 02's local Compose initializer now applies pending owner migrations before starting product traffic; the API process never migrates.

Migration 0002 adds owned profiles, per-session selection, retry receipts, audit and transactional outbox. Both migrations and empty/repeated local initialization are locally verified against PostgreSQL 18.6; Phase 02 remote release remains pending.

The finite `identity-init` command uses one admin connection, nonblocking advisory lock `(42781, 2)`, a ten-second overall deadline and bounded SQL waits. It accepts only absent/[1]/[1,2] ledger state, rejects unknown versions and never resets retained data or reapplies successful SQL. It creates `aster_identity_local` with fixed synthetic local credentials and restricted role membership; existing passwords are not overwritten. Runtime readiness rejects admin credentials and missing product columns. This local-only initializer is not a hosted migration service.

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

Run `pnpm --filter @aster/identity integration:profiles` after the same build for real profile concurrency, ownership, retry, deletion, post-write rollback, retention/backpressure and migration proof. It uses its own disposable fixture; the full matrix also includes both session and profile scenarios.

## Profile contract

- Default five profiles; process configuration allows 1–16. Account locking serializes admission; numbered slots impose a database hard cap of 16. The single local composition owns this configuration; replica-consistent configuration is a Phase 14 requirement.
- Names use NFC, collapsed whitespace and 1–60 Unicode code points, with raw input capped at 256 UTF-16 units. Remaining control/surrogate/bidi-control characters are rejected. Supported canonical locales default to `pt-BR` and `en-US`; configuration accepts at most 16. Maturity is `GENERAL`, `TEEN` or `MATURE`, a preference rather than age verification/legal classification. Avatar references remain null until approved assets exist in Phase 05.
- Every operation verifies both the signed assertion and the durable session, then locks account before session. Foreign and unknown profiles return the same `not_found`. Active selection belongs to the durable session, requires an explicit owned profile ID, and is cleared on deletion across all account sessions.
- Create/update/delete require a caller-generated UUID mutation key scoped to the account. A normalized command digest detects key reuse with changed arguments. Successful receipts retain only ID/version and digest for 24 hours (at most 64/account). Exact retries replay that metadata, even after deletion or an uncertain commit, without recreating a profile or event. After expiry, callers must treat a key as a new request, not retry an old create.
- Updates/deletes require `expectedVersion`; stale requests conflict. A normalized no-op update keeps its version and emits no fact. Selection is idempotent and emits no profile-change event.
- Delete immediately removes display name/preferences while preserving account identity. Audit and outbox retain opaque IDs, versions and necessary event metadata, never profile display data or credentials. A successful delete is replayable through its receipt for 24 hours; afterward an absent profile is `not_found`.
- Audit retention is 30 days, at most 128/account. Expired receipts/audit are cleaned in bounded batches during mutations. Pending outbox facts are capped at 128/account and never expired or evicted: a new event-producing mutation returns `backpressure` atomically at capacity. Reads, selection and receipt replay remain available; no-op updates still require receipt capacity.
- Outbox envelopes use schema version 1, `identity.profile-created|updated|deleted`, producer `identity`, Profile aggregate ID/version, correlation/causation, optional validated trace context, and account/profile IDs. Profile state, audit, envelope and receipt commit in one transaction. Phase 08 will own delivery, retry/replay, consumer deletion and cleanup acknowledgment; none is claimed now.

Migration 0002 grants profile CRUD without ownership-key updates and session selection without session-identity updates. The runtime can insert/read outbox facts but cannot delete/update them. A composite foreign key enforces selected-profile ownership. The migration owner remains separate from runtime credentials.

## Rollback and recovery

Stop product traffic and close runtime connections before rollback. The `0001-accounts-sessions.down.sql` file permanently removes all accounts, sessions and this migration ledger. Use it only for explicitly disposable local data or a separately authorized recovery with a verified backup. It is not an automatic shutdown action.

Reverse 0002 first when present. Its down migration permanently deletes profiles, selection, receipts, audit and pending outbox while preserving accounts/sessions. Use it only for explicitly disposable data; after retained product data or pending delivery obligations exist, use reviewed roll-forward recovery. Both down migrations refuse later dependencies atomically without `CASCADE`. No tested rollback authorizes discarding real pending events.

Rollback uses restrictive drops without `CASCADE`; later dependent objects make it fail atomically. Once later migrations or durable product data exist, prefer a reviewed roll-forward or reverse dependent migrations first. Reapplying the forward migration after successful rollback creates empty tables and a new privilege role; login membership must be provisioned again. Reverting application code alone leaves this additive schema intact.

The runtime transaction adapter gives one lease one total operation budget (two seconds by default, including acquisition), at most 32 sequential statements, 32 bound parameters, 4096 characters per bound string and 64 rows per statement. SQL is source-owned and concrete queries/schema constraints bound results; these limits are not a SQL parser or an API for client SQL. Commit acknowledgment loss is `indeterminate`, never automatically retried. Callers receive no credential on an unknown sign-in commit; an undisclosed row remains bounded and expires.

See [ADR-0013](../../../docs/adr/0013-local-identity-and-sessions.md), [Phase 02 evidence](../../../evidence/phase-02/README.md) and [PostgreSQL row-lock privileges](https://www.postgresql.org/docs/18/sql-select.html).
