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

Catalog has durable rights/history, operator commands, publication transactions and generated-fixture attestations. Big Buck Bunny's selected official archive has approved rights revision 2 / title version 3 and a verified private original; it remains unpublished. The isolated decoder now produces a complete, privately retained HLS candidate. [Decoder evidence](../evidence/phase-06/decoder.md). Historical unresolved source reviews remain unchanged.

The owner-side request, acquisition and durable-processing slices are locally verified: additive migrations 0004/0005/0006, fenced attempts, bounded streaming, current rights and private immutable originals/candidates. Both the full-film HLS and five derived JPEGs are privately retained and replayable. Artwork approval, attestation and publication remain unfinished. Existing Web/acquisition evidence remains applicable.

## Proposed behavior

Request admission and the finite owner acquisition coordinator under [ADR-0022](../docs/adr/0022-local-media-execution.md) are implemented. Continue with bounded ZIP extraction/probe and a separate network-disabled decoder. Define verified-result registration before granting any technical attestation permission; acquisition never grants it.

Decoder checkpoint is committed at `5d4e0e9`; durable processing at `155cefc`. Full-film media evidence remains valid. [ADR-0024](../docs/adr/0024-durable-media-processing.md) implements verified Catalog processing leases, checksum/recipe reuse and private candidate recovery. The existing candidate was independently verified, adopted and replayed without another download or encode. [Evidence](../evidence/phase-06/processing.md). This records durable technical work, not publication authority.

Artwork is complete at `c2a90f3` under [ADR-0025](../docs/adr/0025-derived-artwork.md). Current slice: [ADR-0026](../docs/adr/0026-local-media-publication.md) connects current editorial approval to immutable delivery and restricted attestation. Original reuse for a current rights-approved checksum, the exact local-media URL policy and read-only origin are implemented and verified with focused/PostgreSQL/S3 tests. Next assemble the immutable bundle, approve truthful artwork/modifications, register attestation and activate through Catalog. Reuse all validated film/artwork bytes; do not repeat acquisition or encoding merely to amend metadata. The first title remains unpublished.

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

1. Complete one current source/rights review and verify available FFmpeg/storage.
2. Record processing/attestation authority and recipe/job contracts, then implement the smallest durable attempt.
3. Acquire with stream backpressure/checksum, validate the source and retain it immutably.
4. Produce a source-aware no-upscale HLS ladder, audio, supported captions and derived artwork in isolation.
5. Validate/upload every object, atomically publish through Catalog, generate attribution.
6. Prove retries, cancellation, rights races, partial output, cleanup and rollback; capture resource evidence.
7. Complete one candidate review and one confirmation, protected release and clean demo acceptance.

## Tests

- Domain/application: rights/source identity, state/idempotency, request bounds and refusal before side effects.
- Integration: real Catalog PostgreSQL transactions and S3 immutable-object behavior.
- Contract: recipe/attempt/report/object manifest validation.
- Browser: representative HLS playback and existing browse/attribution where affected; player UI remains Phase 07.
- Performance/failure: bounded acquisition/FFmpeg, memory/backpressure, malformed media, partial upload, concurrent publication/dispute and cleanup.

## Evidence

- Commands: focused Catalog/media tests during iteration; affected source gate at candidate.
- Raw artifact path: evidence/phase-06/.
- Acceptance result: rights, requests, acquisition, private full-length HLS, derived artwork/inspection and independent durable replay pass locally. Source gates 51/51 and documentation/security 10/10 pass for the artwork checkpoint. The complete phase/publication/release gate remains pending.
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
