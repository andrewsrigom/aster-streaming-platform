# Work Item: Independent home rails, stable fallbacks and owner composition

- Status: IN_PROGRESS
- Owner: Discovery read model; Engagement owns continue-watching; Catalog owns title truth
- Phase: 09
- Requirement IDs: P09-R03, P09-R04, P09-R05, P09-R08, P09-R09
- Created: 2026-08-29
- Updated: 2026-08-29

## Outcome

A viewer can request a bounded home model whose public rails fail independently,
report freshness and use a stable recent fallback. An authenticated home request
can compose Engagement-owned continue-watching without copying profile or progress
truth into Discovery.

## Current behavior

Search is released in main `0bdcb27`. PR34 candidate `7d31678` locally verified
the initial rails slice, but confirmation found two blockers: four SQL transactions
per home request exceeded shared admission, and migration3 had no readiness overlap
with the released binary. The database-admission correction is local. Precursor
PR35 exact `8002594` passed75/75,42/42, clean confirmation and protected
run33243983340, then squash-merged as main `583c835`. Exact-main run33244657936
passed every required job; migration3 publication is now unblocked. PR34 exact
`0d1a7ef` passed protected run33245434181. Its remediation confirmation found
that usable partial logs were classified as rejected and ADR-0036 still described
the superseded parallel admission model; both corrections reached exact
`8650670` and protected run33246333963 passed. Its final confirmation found one
architecture excerpt using default20 instead of the authoritative schema default10;
the documentation-only correction reached exact `df08a70` and protected
run33247048014 passed. Closeout confirmation then found the three genre rails can
flatten36 Catalog `Title` representations while its guard allowed20; the bounded
Catalog federation correction is local.
Exact `dbce479` then passed the corrected local54/54 candidate. Closeout review
5057751709 found fallback could replace `cancelled` or `indeterminate` primary
outcomes despite the written contract allowing only `empty` or `unavailable`;
the narrow fallback correction is local.

## Proposed behavior

Add one bounded `homeRails` query to Discovery. It returns separately coded
featured, recently added, curated trending and at most three genre rails. A failed
or empty featured/trending selection may reuse only a successfully read recent
rail and says `FALLBACK`. Curated trending means the Catalog editorial label
`trending`; it makes no behavioral-popularity claim. Add nullable Engagement
`homeContinueWatching` through existing owner authorization. Each home request
uses at most one runtime transaction at a time; four GraphQL admissions plus one
readiness reservation fit the five-connection runtime pool.

## Boundaries

- Owning context: Discovery owns rail definitions/order; Engagement owns
  continue-watching; Catalog owns public title truth.
- Affected services/packages: Discovery, narrow Engagement and Catalog federation
  transports, telemetry, Router artifacts and Phase 09 evidence.
- Authoritative data: Catalog title/publication facts and Engagement progress.
- Read models/caches: existing versioned Discovery PostgreSQL projection; no Redis.
- Trust boundaries: public GraphQL input, Router owner credentials, projection rows,
  migration rows and telemetry labels.
- External dependencies: existing PostgreSQL, Router/Federation and OpenTelemetry.

## Invariants

- Discovery never persists profile, progress or session data.
- Current Catalog resolves every returned `Title` reference.
- One rail failure cannot remove an independently completed rail.
- Results are bounded to twelve titles per rail and three genre rails.
- Expired projection rows are not served; fallback bypasses no rights/visibility.
- A home request reserves at most one runtime transaction concurrently.
- Catalog admits at most36 home entity representations and retains owner batches
  of at most20 through its request-scoped DataLoader.
- Migration3 waits for the finite search compatibility precursor on exact main.
- The old search migrator tolerates marker3 but owns/applies only scripts1–2 and
  rejects marker4.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Featured/trending unavailable or empty | Use independently completed recent titles as `FALLBACK`; otherwise preserve primary result, including cancelled/indeterminate | rail outcome, duration, fallback count |
| Genre error | Fixed rails remain; genres report failure | rail outcome and duration |
| Projection stale | Explicit `STALE`, no edges | freshness and stale outcome |
| Engagement unavailable | Nullable personalized root fails without nulling public rails | owner/Router outcome |
| Cancellation/deadline | Stop pending SQL and propagate bounded cancellation | cancelled outcome |
| Migration mismatch | Readiness unavailable; old search remains ready on staged marker3 | existing readiness outcome |

## Data and contracts

- Schema/migration: additive security-barrier `rail_documents` view over matching
  generation/fence version/digest. Down drops only the view.
- GraphQL: additive `homeRails` and nullable `homeContinueWatching`.
- Events: unchanged Catalog and Engagement v1 events.
- Cache: none; projection lease remains at most300seconds.
- Compatibility: precursor accepts current/successor markers; rails binary requires
  marker3 and its restricted view.
- Retention/deletion: no new personal data; rails follow projection retention.

## Security and privacy

- Authorization: public rails need none; personalization stays in Engagement.
- Input limits: first1–12, fixed rail/edge result bounds, existing body/parser/depth/
  alias/cost/deadline/concurrency limits; Catalog entities36, other lists20.
- Sensitive data: no query/title text, profile ID, credential or media URL in
  rail/search telemetry.
- Abuse cases: reject operation substitution, excess fields/aliases and malformed
  persisted rows before application authority.

## Implementation steps

1. Precursor exact-main run33244657936 passed.
2. Rebase PR34 and prove migration3 against staged-old and rails-new readiness.
3. Keep one transaction per home request, five finite runtime connections and an
   overlapping-request regression.
4. Repeat affected PostgreSQL/runtime/candidate gates.
5. Resolve review discussions, confirm the corrected observability/documentation
   boundary and publish through protected release.

## Tests

- Domain: input bounds, stable keys/source labels, outcomes and fallback.
- Application: independent failures, stale/cancelled, maximum rail/edge bounds and two
  overlapping requests with one transaction each; fallback preserves cancelled
  and indeterminate primary outcomes.
- Integration: real PostgreSQL view, privileges, generation match, ordering,
  expiry, retirement and mixed old/new readiness.
- Contract: five-subgraph composition, nullability, known operations and cost.
- Owner batching: Catalog accepts36 valid entity references, rejects37 and splits
  the accepted maximum into owner reads of at most20.
- Browser: excluded; P09-R10 owns visible SSR/hydration.
- Performance/failure: Router proof with rail fault, Engagement isolation and
  finite metrics; no media/CPU experiment.

## Evidence

- Commands: focused tests during edits; affected `pnpm check:changed` at candidate.
- Raw artifact path: `evidence/phase-09/home-rails-*.txt`.
- Acceptance result: initial rails passed Discovery82/82, telemetry10/10, real
  PostgreSQL/runtime and54/54; admission fix passes Discovery83/83. Precursor
  correction passes75/75,42/42, protected CI and review. Rebased Discovery88/88, real PostgreSQL mixed
  readiness and the repeated eleven-service runtime pass; final exact-main rebase
  preserved exact affected source objects and the54/54 candidate passed. The
  latest partial-log/ADR correction passes focused Discovery89/89 and the final
  affected54/54 candidate in47.708s. The Catalog capacity correction passes its
  build and230/230 focused tests; the corrected affected candidate passes54/54,
  38 cached, in55.844s. The fallback correction passes Discovery build and90/90
  focused tests; its corrected affected candidate passes54/54,38 cached, in49.022s.
- Iteration gate: strict builds, focused node:test and scoped lint.
- Candidate gate: canonical affected gate and schema compatibility.
- Heavyweight repeat triggers: mixed-version/view SQL and changed pool/admission
  repeat PostgreSQL and Router runtime; docs-only closeout carries them forward.
- Review stopping rule: confirmation produced two P1 blockers and remediation
  confirmation produced two requirement/documentation P2 blockers. Batch the
  latter; subsequent confirmations found a public-contract documentation mismatch
  and then the real Catalog entity-capacity blocker. Its confirmation found one
  public-contract blocker where fallback hid cancelled/indeterminate outcomes.
  Correct that narrow boundary and run one final confirmation; reopen only for
  requirement, security/data, availability or public-contract blockers.

## Rollback or recovery

PR35 exact-main passed; migration3 is old-search compatible.
Restore prior Router/owner artifacts and drop only the rail view once no rails
binary uses it. Preserve projections, Catalog/Engagement data, media and credentials.

## Documentation updates

ADR-0035/0036, Discovery/Engagement operations, migration guide, Phase 09 evidence
and repository memory.

## Completion checklist

- [x] Requirements implemented
- [x] Final fallback-contract candidate pass
- [x] Affected heavyweight evidence captured
- [x] Documentation current for dependent work
- [x] `.ai/` state updated
- [x] Remaining risks recorded
