# Work Item: Rights-Aware Catalog Lifecycle

- Status: IN_PROGRESS
- Owner: Catalog
- Phase: 03
- Requirement IDs: P03-R01, P03-R02, P03-R03, P03-R04, P03-R07
- Created: 2026-08-27
- Updated: 2026-08-27

## Outcome

Implement pure Catalog rights completeness, approval, derived attribution and lifecycle rules with deterministic tests. This slice does not claim persistence, operator authentication, public browse, media validation or a running Catalog service.

## Current behavior

Phase 02 is released through PR 19 squash ec6386ca7add0f12ae748589be763d9e90ff0d6c. Protected run 33066484199 and exact post-merge 33066827332 pass, including the real Docker product and eleven integration scenarios. Catalog has no implementation. Bounded HTTPS reads of https://peach.blender.org/about/ and its official download index succeeded on 2026-08-27, satisfying source availability; no asset was approved or downloaded.

## Proposed behavior

Create the accepted Catalog owner under services/catalog with domain code/tests only, no new runtime dependency. Normalize bounded rights records, reject unresolved/contradictory permissions, derive attribution and enforce all lifecycle transitions. Synthetic records and injected time are not real-film rights approval.

## Boundaries

- Owner/data: Catalog; later catalog PostgreSQL schema, no Identity table imports.
- Paths: services/catalog/src/domain, index, tests, package/tsconfig; workspace lock; evidence/phase-03 and closeout memory.
- Decisions: ADR-0002, 0003, 0004, 0006, 0007, 0010, 0013, 0014. No changed invariant.
- Skills: agent, product, architecture, media-streaming, security, testing, documentation, system-design.
- Trust: metadata, rights and publication references are untrusted. Operator authorization, authoritative technical attestation and transactions belong to the next application slice; never accept a public validated boolean.
- No network, database, broker, cache, download, FFmpeg or public endpoint in this slice.

## Invariants

- Approval requires exact source/asset/license, creator/holder, attribution, review evidence and explicit permissions.
- Unresolved, expired, disputed or incompatible rights never permit publication.
- Source checksum may be null before acquisition: requiring it before approval would create a permission/download cycle. Media-ready requires a checksum and a validated publication reference supplied by the future owning application boundary.
- DRAFT -> RIGHTS_REVIEWED -> MEDIA_READY -> PUBLISHED -> RETIRED. Retirement is allowed from any non-retired state. Reopening RETIRED returns to DRAFT, clears media linkage and requires renewed review.
- Publication must match title/rights revision; publish rechecks current rights and expiry.
- Public eligibility fails immediately on expiry/dispute, independently of background retirement.
- Attribution derives from approved facts; no inferred endorsement.

## Failure behavior

| Failure | Result | Telemetry |
|---|---|---|
| Malformed/oversized input, invalid time/version | INVALID_INPUT | Pure result, no logging |
| Missing, disputed, expired or incompatible rights | RIGHTS_NOT_APPROVED | Pure result |
| Wrong title/revision or missing media evidence | MEDIA_NOT_READY | Pure result |
| Skipped/repeated lifecycle transition | INVALID_TRANSITION | Pure result |

## Data and contracts

Rights preserve exact reviewed facts and bounded evidence locations. Approval is an explicit owner decision, not inferred from a URL. Redistribution/transformation and unrestricted delivery are required; commercial compatibility is an explicit policy input. Source checksum is nullable before acquisition. Immutable title transitions advance version. Database locks, audit/outbox, idempotency, operator trust and GraphQL remain the next slice.

## Security and privacy

Reject unknown fields/accessors and credential-bearing URLs; bound strings/lists and validate IDs/times. Fixtures use synthetic actors only. Viewer JWTs cannot become operator credentials. Software-license authorization does not invent media rights.

## Implementation steps

1. Close Phase 02 and activate this item from clean main.
2. Implement rights approval/attribution and lifecycle rules.
3. Test all state pairs, completeness, permissions, expiry, stale media linkage, hostile inputs and immutable outputs.
4. Focused/static and candidate gates; one initial/confirmation review; capture evidence.
5. Commit this local slice, then activate persistence/operator/public queries without a domain-only remote PR.

## Tests

Domain: complete transitions, invalid rights/permissions, expiry, attribution, media linkage and immutable outputs. Application/integration/GraphQL/browser remain planned; domain tests do not prove those boundaries. No media download.

## Evidence

- Iteration gate: Catalog build/test, scoped ESLint and typecheck.
- Candidate gate: pnpm check:changed; frozen install and high/critical audit for lock changes.
- Heavyweight repeat triggers: SQL/runtime/HTTP/image/worker changes; no Docker matrix repeat for pure domain rules.
- Review stopping rule: one initial plus confirmation; only requirement/security/data/public-contract findings block.
- Raw artifact: evidence/phase-03/catalog-domain.txt.
- Unchanged Identity behavior retains exact Phase 02 hosted evidence.

## Rollback or recovery

Remove the Catalog package and importer; no migration, durable data or hosted resource changes.

## Documentation updates

Phase 02 release evidence; current domain policies; .ai state/queue/handoff. Keep UI/hosted/real-media behavior planned.

## Completion checklist

- [x] Bounded domain requirements satisfied
- [x] Focused and candidate gates pass (52 tasks; 52 Catalog tests)
- [x] Evidence and review captured
- [x] Documentation and memory current
