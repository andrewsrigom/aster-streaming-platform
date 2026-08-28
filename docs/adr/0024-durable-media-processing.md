# ADR-0024: Durable Processing and Private Candidate Reuse

- Status: Accepted
- Date: 2026-08-28
- Requirements: P06-R01, P06-R06, P06-R10, P06-R12

## Decision

Extend the existing finite Catalog coordinator with PostgreSQL processing attempts. A successful, currently authorized acquisition is required before claim. The key is SHA-256 of source checksum, NUL separator and recipe identifier, identical to the decoder report. Keep at most three attempts per key and one global RUNNING processing row. A short transaction takes the processing advisory slot before the title lock; no filesystem, storage or decoder work holds a transaction open.

A non-renewable 30-minute lease exceeds the coordinator's 29-minute deadline. Attempt identity and expiry fence every guard and completion. A retry retires an expired attempt; transient storage failures, cancellation and lease expiry may retry within the fixed budget. Invalid output and internal invariant failures are terminal. Failure recording remains allowed after a rights dispute, never success. Retain actor, correlation, request time, start/end, classified outcome and immutable candidate identity.

Completed checksum/recipe work can be reused by another currently approved request for the same bytes. That does not inherit the previous request's rights: authorize the caller's acquired original first and verify its source identity independently. The private candidate is technical work, not editorial authority; publication must still bind its own title/current rights. No worker receives database credentials or new grants.

The first already-retained candidate may be adopted through an explicit manifest/checksum selector. The owner derives its prefix from the authorized original, reads a bounded report, checks source/recipe/manifest and streams every referenced object through exact size/SHA-256 validation before completing a newly claimed attempt. Normal replay uses the stored candidate reference and repeats storage integrity verification, not encoding. No caller boolean constitutes validation and neither path inserts a publication.

Migration 0006 is additive, without backfill, and preserves old HTTP readers. Runtime gets SELECT/INSERT/UPDATE on processing attempts only; readers get no access. The initializer learns version 6. Down requires an empty table and no unexpected dependencies; after work is recorded, retain audit and roll forward. Original acquisition remains unchanged.

## Verification and recovery

Verify competing claims, stale completion, exact replay/conflict, bounded retries, rights revocation, cancellation, transaction rollback, private role grants and empty/nonempty migration behavior. Verify corrupted/missing candidate objects and invalid selectors cannot complete work. Record the real retained-candidate adoption and replay without another source download or FFmpeg run. Process loss leaves a finite lease, not success; private partial objects are not active publications and remain recoverable by content identity.

This decision completes processing ownership, not Phase 06. Artwork, authoritative attestation, public delivery and publication acceptance remain required. [Acquisition authority](0022-local-media-execution.md) and [decoder boundary](0023-isolated-media-decoder.md) are unchanged.
