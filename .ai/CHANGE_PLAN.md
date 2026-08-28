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

Catalog has durable rights/history, operator commands, publication transactions and generated-fixture attestations. Big Buck Bunny's selected official archive now has real approved rights revision 2 / title version 3 and derived attribution; it remains publicly invisible before processing. Existing FFmpeg and private S3 are available. No source was acquired and no general pipeline exists. The prior candidate records remain historical unresolved reviews.

## Proposed behavior

First preserve fresh official project, asset-directory, creator and license evidence; select one exact manageable full-film asset; validate rights facts through existing Catalog commands and derive attribution. Record archive handling and caption status honestly. Then specify the worker/attestation authority in an ADR before implementing that trust boundary.

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

- Schema/migration: existing rights schema for the first slice; plan job/attempt migrations and restricted attestation registration before code.
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
- Acceptance result: not yet implemented; rights preflight only.
- Iteration gate: changed pure tests/types plus smallest boundary experiment.
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
- [x] Phase 05 predecessor is frozen, locally accepted and exactly identified
- [ ] Remaining risks recorded and resolved or explicitly owned
