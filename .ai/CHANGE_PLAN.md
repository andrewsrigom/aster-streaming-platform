# Work Item: One rights-approved immutable media publication

- Status: IN_PROGRESS
- Owner: Catalog owns rights, processing requests and active publication; isolated media work owns computation only
- Phase: 06
- Requirement IDs: P06-R01, P06-R02, P06-R03, P06-R04, P06-R05, P06-R06, P06-R07, P06-R08, P06-R09, P06-R10, P06-R11, P06-R12
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

Turn one individually approved film into a validated immutable HLS publication through bounded streams and isolated FFmpeg, preserving credits and attribution. The first slice resolves rights and source availability before any acquisition.

## Current behavior

Phases 00–05 are released. PR 22 squash f36f9aa7043dc1fe7b6394a0a800e4e842bf6865 passes protected candidate CI 33132937180 and exact post-merge CI 33133330003. This branch is rebased onto that clean release; no predecessor wait remains. [Release evidence](../evidence/phase-05/release.txt).

Catalog has durable rights/history, operator commands and publication transactions. Big Buck Bunny is now locally published at title version 9 / rights revision 4, preserving original review 2 and all immutable source/processing history. Its 209-object HLS/JPEG/attribution bundle is independently verified. [Publication evidence](../evidence/phase-06/publication.md). Historical unresolved source reviews remain unchanged.

The request, acquisition, processing and publication slices are locally verified: additive migrations 0004–0007, fenced attempts, bounded streaming, current rights, immutable source/candidates and restricted attestation. Artwork and actual modifications are approved; normal Catalog commands activated the first bundle. Existing acquisition/decoder evidence remains applicable. Compatible replacement/rollback now passes focused and real PostgreSQL checks. Orphan handling, browser playback and phase release remain open.

## Proposed behavior

Request admission and the finite owner acquisition coordinator under [ADR-0022](../docs/adr/0022-local-media-execution.md) are implemented. Continue with bounded ZIP extraction/probe and a separate network-disabled decoder. Define verified-result registration before granting any technical attestation permission; acquisition never grants it.

Decoder checkpoint is committed at `5d4e0e9`; durable processing at `155cefc`. Full-film media evidence remains valid. [ADR-0024](../docs/adr/0024-durable-media-processing.md) implements verified Catalog processing leases, checksum/recipe reuse and private candidate recovery. The existing candidate was independently verified, adopted and replayed without another download or encode. [Evidence](../evidence/phase-06/processing.md). This records durable technical work, not publication authority.

Artwork is complete at `c2a90f3` under [ADR-0025](../docs/adr/0025-derived-artwork.md). [ADR-0026](../docs/adr/0026-local-media-publication.md) now connects current editorial approval to immutable delivery and restricted attestation. Local-only URL policy, bounded verified copies, exact replay, SQL authority/dispute checks and actual first-film activation pass. Publication is consolidated in `4bc9b3a`; compatible rollback is implemented/tested. Finish orphan/browser acceptance. Reuse all validated film/artwork bytes; no new source GET or encoding.

## Boundaries

- Owning context: Catalog; no worker editorial writes or cross-context SQL.
- Affected services/packages: Catalog, existing S3/runtime adapters, isolated media tooling and scoped Compose packaging.
- Authoritative data: Catalog PostgreSQL; originals and immutable renditions in existing S3-compatible storage.
- Read models/caches: no new Redis source of truth or duplicated editorial authority.
- Trust boundaries: operator input, public source/redirects, archive/media bytes, subprocess output and publication reports.
- External dependencies: existing pinned Node, PostgreSQL, VersityGW and separate FFmpeg image; any new tool requires current compatibility/license evidence.

## Invariants

- Approval precedes source GET; checksum may remain null until bounded acquisition.
- Exact approved source identity and current rights are rechecked before processing and publication.
- No source/media bytes enter Git or application HTTP responses.
- No partial output becomes Catalog's active publication.
- Full film credits remain; no DRM, endorsement claim or unreviewed promotional assets.
- Do not start a second film until the first complete path is verified.
- Preserve retained databases and owner Windows processes.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Missing/contradictory rights | Reject before network acquisition | Bounded rejection reason |
| Unsafe redirect/archive, excessive bytes, stall or checksum mismatch | Abort, retain no publishable result | Classified acquisition failure |
| Probe/FFmpeg invalid output, timeout or cancellation | Stop isolated process and clean only owned temporary output | Attempt outcome/resource record |
| Partial upload, stale rights or competing attempt | No active-pointer update; idempotent recovery | Validation/publication conflict |
| Process interruption | Durable retry/cancellation semantics; no silent success | Attempt and orphan status |

## Data and contracts

- Schema/migration: additive 0004 requests, 0005 acquisition attempts and 0006 processing attempts are applied. Processing has one global running slot, three attempts/checksum-recipe, 30-minute non-renewable leases and conditional completion. No backfill; empty-only down migrations, otherwise roll forward. Restricted technical attestation registration remains separate.
- GraphQL: existing public API ownership; no public upload/admin feature.
- Events: keep existing outbox semantics; broker relay remains Phase 08.
- Cache: no cache needed for rights approval or source authority.
- Compatibility: current browse/profile demo remains usable while media work is opt-in.
- Retention/deletion: immutable originals/publications, retained audit, exact owned-attempt cleanup only.

## Security and privacy

Use the existing local Catalog operator, never viewer credentials or input-selected authority. Bound every network body, redirect, archive entry, process argument, output and deadline. Isolated decoding receives no network or database credentials. Store only public creator/rights facts and sanitized evidence; no owner personal data or private connection strings.

## Implementation steps

Browser acceptance (P06-R07) starts after scratch checkpoint `9a4656d`. Use a separate loopback-only technical probe page and the retained published HLS, not a Phase 07 product player. Pin root development-only `hls.js` 1.7.1 (Apache-2.0, no runtime dependencies, registry integrity recorded with the probe evidence); retain its LICENSE and no Aster license change. This is the HLS.js client already named by the accepted playback specification, selected now to verify actual browser transmux/decode. The probe serves only its own HTML/script/library, never media bytes, uses bounded buffering/deadlines and shows measured frame/time/duration/error state in the DOM. Verify both renditions and representative seeks against the existing origin; no original download or encoding. Product player controls, Redux state and playback sessions stay Phase 07.

Orphan checkpoint (P06-R04/R10) starts from `f3c5379`. Give decoder scratch volumes run-UUID names so another run never reuses a deletion target. Add a local-only, dry-run-first cleanup command for an explicit project/run. It may remove only matching stopped containers and their exact tmpfs scratch after 31 minutes, with no foreign volume consumer; recheck each target and never force removal. Keep immutable object-storage content and Catalog audit for verified replay. Test hostile/active/young/foreign targets and interrupted cleanup, then a tiny disposable Docker fixture with a controlled test clock. No real film download/encode, retained-data deletion or host diagnostic. Storage-prefix garbage collection is not implied by scratch cleanup and remains an explicit phase assessment.

Rollback checkpoint (P06-R09/R10) starts from publication commit `4bc9b3a`. Add owner commands `replace` and `rollback` while keeping the title PUBLISHED. Both require a different registered publication for the same title/current approval/source checksum, unchanged approved artwork, optimistic version and final expiry check. Rollback additionally requires durable evidence that the target was previously active; it cannot activate an unused candidate. Migration 0008 adds append-only publication activation history, backfilled from retained published events, and a transaction-local trigger for future events. History survives future outbox relay; no new worker authority or public mutation. Existing title lock, receipts, audit, outbox and reserved takedown capacity apply. Test pure eligibility/replay/failure and real PostgreSQL migration/privileges/races; do not change retained first-film data or repeat media experiments for this slice.

Publication checkpoint: bind the two durable successful candidate reports to the approved original checksum and stable film/artwork attribution facts. A read-only preview computes final URLs before the existing editorial review; preview never authorizes copying. The restricted attester then rechecks current version/rights, verifies every copied object and registers through a title-locking SECURITY DEFINER function with no editorial grants. Historical successful computation may be reused across rights revisions only for the exact newly approved source checksum. No new source GET or decoder job is needed. Copy sequentially via a bounded per-object temporary file to avoid deadlocking the single-writer storage service; master is last. Prove SQL authority/races and interrupted immutable replay with disposable fixtures before using retained data.

1. Complete one current source/rights review and verify available FFmpeg/storage.
2. Record processing/attestation authority and recipe/job contracts, then implement the smallest durable attempt.
3. Acquire with stream backpressure/checksum, validate the source and retain it immutably.
4. Produce a source-aware no-upscale HLS ladder, audio, supported captions and derived artwork in isolation.
5. Validate/upload every object, atomically publish through Catalog, generate attribution.
6. Prove retries, cancellation, rights races, partial output, cleanup and rollback; capture resource evidence.
7. Complete one candidate review and one confirmation, protected release and clean demo acceptance.

## Tests

Browser checkpoint outcome: both renditions pass beginning/middle/end decoded-frame callbacks in one real run, no HLS/browser errors. [Evidence](../evidence/phase-06/browser.md). The package extension supplies only upstream's exact missing declaration dependencies (`@svta/cml-cmcd` 2.4.0 and `eventemitter3` 5.0.4); no skipLibCheck, runtime patch or license change. The source gate passes 51/51 without cache using Turbo concurrency two. Remaining storage-prefix orphan handling stays open.

- Domain/application: rights/source identity, state/idempotency, request bounds and refusal before side effects.
- Integration: real Catalog PostgreSQL transactions and S3 immutable-object behavior.
- Contract: recipe/attempt/report/object manifest validation.
- Browser: representative HLS playback and existing browse/attribution where affected; player UI remains Phase 07.
- Performance/failure: bounded acquisition/FFmpeg, memory/backpressure, malformed media, partial upload, concurrent publication/dispute and cleanup.

## Evidence

- Commands: focused Catalog/media tests during iteration; affected source gate at candidate.
- Raw artifact path: evidence/phase-06/.
- Acceptance result: rights, acquisition, private full-length HLS/JPEG, durable replay, immutable publication and Catalog activation pass locally. Bundle/S3 focused tests 25/25, real PostgreSQL/S3 and source gates 51/51 pass. Existing Web title/global attribution SSR is verified over the updated Catalog. Publication closeout passes 10/10. Compatible rollback passes 18 focused checks, full PostgreSQL, source 51/51 (158 Catalog tests) and documentation/security 10/10; orphan/browser/release acceptance remains pending.
- Iteration gate: focused acquisition-reuse, media-URL, publication/coordinator tests and affected builds. Verify changed privileges against disposable PostgreSQL and changed origin behavior with synthetic S3 objects, then reuse the retained first-film candidates for publication. Existing download/HLS/JPEG evidence remains valid because source and recipes are unchanged. Do not repeat source GET, full-film encoding or Web benchmarks.
- Candidate gate: complete first-film pipeline, real persistence/storage, adverse cases and affected source checks.
- Heavyweight repeat triggers: source, recipe, worker, storage, publication or packaging changes repeat their affected experiment; prose does not repeat transcoding/browser/clean startup.
- Review stopping rule: one initial and one confirmation; extra rounds only for requirement, security/data, availability or public-contract blockers.

## Rollback or recovery

Before publication, cancel only the owned attempt and keep prior active publication. After publication, restore only a previously validated compatible version through Catalog. Preserve originals/audit and retained demo data. The frozen Phase 05 predecessor rolls back through its Web/seed/origin overlay to the released HTTP-only topology without data deletion.

## Documentation updates

Update rights/attribution facts, actual commands, evidence and repository memory at meaningful checkpoints. Keep the unresolved historical candidate reviews intact. Record the unrelated moderate uuid advisory triage: installed Apollo callers use v1/v4 without caller buffers, not affected v3/v5/v6; no current exploit path observed. Revisit supported dependency remediation before hosted release without weakening audit.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [x] Phase 05 predecessor is released and exactly identified
- [ ] Remaining risks recorded and resolved or explicitly owned
