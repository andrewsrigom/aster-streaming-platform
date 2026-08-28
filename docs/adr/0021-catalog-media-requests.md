# ADR-0021: Catalog-Owned Durable Media Requests

- Status: Accepted
- Date: 2026-08-28
- Requirements: P06-R01, P06-R06; supports P06-R02 and P06-R10
- Scope: local, reversible Phase 06 implementation under the standing authorization

## Decision

Record media requests in Catalog PostgreSQL through the existing local operator authority. No public mutation, new service, broker relay, or viewer privilege is added. Media computation remains outside request-serving processes under ADR-0002 and ADR-0006.

A request binds the title, current approved rights revision, exact approved asset URL, expected byte length, strong HTTP ETag, optional SHA-256 and versioned recipe identifier. The first recipe contract is `hls-avc-aac-v1`: source-aware, no-upscale H.264/AAC HLS preserving the complete film and credits. This identifier does not assert that encoding is implemented. Acquisition will enforce the pinned representation and calculate its actual checksum. For ZIP sources the source checksum identifies the downloaded archive; extracted media will have a separate checksum.

The title row lock serializes acceptance with rights edits/disputes. Request insertion and its actor/time/correlation audit are one transaction; no network or media work occurs while the lock is held. Acceptance does not advance editorial version, create an attestation, or change the active publication.

The request ID is a permanent idempotency key. Exact same-actor replay returns the original record only while rights remain eligible. Changed input or another actor conflicts. A second ID for the same title/rights/source/recipe conflicts instead of creating duplicate work. A fingerprint is not proof of downloaded bytes: content-checksum processing idempotency remains required after acquisition.

Retain at most 16 distinct requests per title, enforced by unique bounded slots. Retries use the existing request, not another slot. Capacity fails closed without deleting audit or blocking editorial retirement. This intentionally small local policy is not an unlimited ingestion queue; extending it requires an explicit retention/capacity policy.

## Trust and failure boundaries

An accepted request is durable intent, not a reusable rights credential. The future executor must recheck current rights before acquisition/processing and Catalog must recheck before publication. A stale, disputed, expired, foreign-title or changed-source request cannot authorize a download. This slice performs no source GET.

Input cannot choose FFmpeg arguments, credentials, a publication URL, validation flags, or destination paths. The operator still cannot write technical attestations. Worker isolation, attempt leases and validated-result registration remain planned and must be specified before that authority is implemented; no broad worker database grant is introduced here.

Requests survive process restart and uncertain commits can be resolved by replaying the same ID. Transaction errors/cancellation never report success. A one-second statement timeout and propagated bounded transaction deadline reuse the existing Catalog adapter. Authority and rights expiry are checked again after insertion so failed final checks roll back the record.

## Migration and recovery

Migration 0004 adds one table and grants SELECT/INSERT only to the existing Catalog runtime role. Public readers receive no access. Existing titles and readers need no backfill and previous binaries can ignore the new table. Down migration is allowed only while the table is empty, without CASCADE; otherwise retain audit and roll forward. Stopping request admission leaves editorial state and existing publications unchanged.

## Alternatives and verification

In-memory jobs lose intent on interruption. A new orchestration service or early broker relay adds a boundary not needed for this first film. Caller-provided approval or direct worker editorial SQL would violate existing authority. The selected owner-side request is the smallest durable boundary.

Verify strict input, current rights/source matching, authority before I/O, exact replay/conflict, duplicate work, bounded capacity, rollback, cancellation, expiry during transaction, restricted database privileges, migration compatibility and real concurrent request/dispute behavior. Do not call these checks a working media pipeline.

Sources: [PostgreSQL row locks](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS), [HTTP strong validators and If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-match), [local operator authority](0015-local-catalog-operator.md), [rights invariant](0010-content-rights.md).
