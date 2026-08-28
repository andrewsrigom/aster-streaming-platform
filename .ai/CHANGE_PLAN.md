# Work Item: One rights-approved immutable media publication

- Status: IN_PROGRESS
- Owner: Catalog owns rights, processing requests and publication; isolated media work owns computation only
- Phase: 06
- Requirement IDs: P06-R01, P06-R02, P06-R03, P06-R04, P06-R05, P06-R06, P06-R07, P06-R08, P06-R09, P06-R10, P06-R11, P06-R12
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

Turn one individually approved film into validated immutable HLS, preserving source history, credits and attribution, with bounded processing and recoverable Catalog publication.

## Current behavior

Phases 00–05 are released at main f36f9aa7043dc1fe7b6394a0a800e4e842bf6865. Big Buck Bunny is locally PUBLISHED at version 9 / rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. Its source, HLS/JPEG, durable attempts, restricted attestation, compatible rollback, scratch cleanup and six browser samples are verified. [Acceptance matrix](../evidence/phase-06/acceptance.md).

Initial PR 23 head 459607b407d1b6f0fd63b5416d06a9fc34b4b36d exposed partial children through broad storage policy; review made the PR draft. CI 33151304060 passed source/governance/dependencies/platform/real Catalog media but failed the standalone probe's old migration expectation. Both corrections are implemented locally; corrected protected release is still required.

## Proposed behavior

Finish the existing phase, not a new work item. Copies remain private until every object/current approval passes, then one serialized policy update reveals the exact complete prefix. Preserve prior verified prefixes and URLs. The attempted object ACL was rejected by the pinned POSIX backend (501); its evaluator also lacks tag conditions. Use supported exact resource policy, bounded to 100 prefixes / 20 KB, and a private conditional-create non-expiring recovery barrier. [ADR-0026](../docs/adr/0026-local-media-publication.md).

The known retained bundle has already been checksum-verified and restricted: 209 objects / 95496764 bytes, unchanged title, no media/editorial writes. All anonymous HEADs and changed delivery boundaries pass. Correct the standalone probe to migrations 1–8 while retaining the repeated empty migration check.

## Boundaries

- Owning context: Catalog. Workers cannot edit titles or approve rights.
- Affected code: publication-storage/access, publisher composition, access/copy/integration tests, standalone Catalog verification.
- Authoritative data: Catalog PostgreSQL; immutable media in existing object storage.
- Read models/caches: unchanged; no new Redis authority, context or service.
- Trust boundaries: current operator rights, untrusted media/report/object bytes, storage policy and network responses.
- External dependencies: existing pinned Node, PostgreSQL, VersityGW and isolated FFmpeg. No new dependency in this correction.

## Invariants

- Rights before acquisition/processing and current checks before registration/activation.
- No partial media becomes anonymously readable or active.
- No source GET, encode or browser/CPU benchmark repeated for unchanged bytes.
- No application media-byte proxy, DRM, invented rights or new public mutation.
- No immutable media/audit overwrite/deletion or unrelated Windows/Docker change.

## Failure behavior

| Failure | Expected behavior | Evidence |
|---|---|---|
| Missing/corrupt object or stale rights | No new access grant or Catalog activation | Focused and real storage/SQL tests |
| Competing policy writer | Conditional-create barrier refuses; previous grants preserved | Real storage fixture |
| Crash/uncertain policy write/readback | Barrier retained; no automatic lease takeover; existing reads continue | Focused failure tests and recovery runbook |
| Partial copy | Private immutable partial retained for checked replay | Real storage fixture |
| Unknown/broad policy or policy capacity | Fail closed, no silent replacement | Policy tests |
| Catalog registration/dispute race | Title lock, current rights, idempotent audited registration | Existing real PostgreSQL evidence |

## Data and contracts

- Schema/migration: additive 0004–0008 verified; retained runtime still 0007. Apply 0008 before replace/rollback, never erase populated history.
- GraphQL, events, cache: unchanged; broker relay remains Phase 08.
- Compatibility: preserve URLs and prior completed grants; the explicit known-legacy restriction was recorded separately.
- Retention/deletion: immutable originals/candidates/publications/audit retained; only owned disposable scratch and completed control locks removed.
- ADRs 0021–0025 still own requests, acquisition, isolated decoding, durable processing and artwork. ADR-0026 owns publication/recovery.

## Security and privacy

Existing local trusted Catalog/S3 authority only. Strict policy shape/prefix/count, per-object/job/network bounds, propagated cancellation and single private POSIX writer remain required. Storage grant is separate from editorial activation. No private credentials or real viewer data in evidence; local fixture credentials remain visibly synthetic.

## Implementation steps

1. Complete rights, bounded original acquisition, isolated HLS/JPEG, durable replay and restricted first-film activation — done.
2. Verify compatible rollback, disposable scratch and representative browser playback — done.
3. Batch initial review/CI corrections; verify real access boundary and restrict retained known bundle — done.
4. Complete candidate gates and one confirmation review; publish correction to existing PR 23.
5. Require protected exact-head CI, squash without bypass and exact post-merge CI; then activate Phase 07.

## Tests

- Domain/application: current rights/source, immutable copy, complete integrity before access, cancellation/revocation.
- Integration: real S3 partial/grant/replay/lock/origin negatives; existing real PostgreSQL attempts/privileges/rights races/rollback.
- Contract: bounded exact policy including rejection of ignored condition fields; standalone full migration list plus idempotent empty repeat.
- Browser: previous six actual decode/seek samples retained; access-only change rechecks every referenced HTTP object.
- Performance/failure: previous bounded source/FFmpeg/resource evidence retained; no unchanged host experiment.

## Evidence

- Current access/bundle tests: 10/10; standalone runtime contracts: 3/3.
- Source candidate: 51/51, 37 cached, 54.186s, pnpm check:source --concurrency=2; [raw output](../evidence/phase-06/access-source.txt).
- [Access fixture, retained migration, HTTP and limitations](../evidence/phase-06/publication-access.md).
- Iteration gate: focused affected build/tests/lint.
- Candidate gate: full source plus docs/security, real changed access behavior, complete phase acceptance matrix and exact protected head.
- Heavyweight repeat triggers: repeat only affected source/recipe/SQL/storage/packaging changes. Current access correction repeats S3/HTTP, not unchanged encode or browser rendering.
- Review stopping rule: one initial review and one confirmation. Extra round only for a requirement/security/data/availability/public-contract blocker; speculative future hardening does not extend this phase.

## Rollback or recovery

Cancel before activation and retain immutable bytes. Use owner-compatible prior activation or retire afterward. Interrupted access grant requires fencing all publishers and restarting only the private writer before inspecting/removing its exact control barrier; no lease expiry takeover. Never restore broad partial-access policy as rollback. Keep compatible code for retained audit and roll forward after used migrations.

## Documentation updates

Record actual access policy, bounded barrier recovery, retention, measured migration/HTTP evidence and current release state. Update repository memory at this coherent checkpoint, not every experiment.

## Completion checklist

- [x] Local requirements mapped and changed access boundary verified
- [x] Focused and source tests pass
- [x] Raw evidence captured; failed attempts retained honestly
- [x] Retained media, history and existing Web preserved
- [x] Corrected documentation/security (10/10) and confirmation closed
- [ ] Exact protected and post-merge CI pass
- [ ] Phase release and next-phase activation recorded
