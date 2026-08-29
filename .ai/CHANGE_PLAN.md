# Work Item: Server-rendered discovery and profile-safe home enhancement

- Status: IN_PROGRESS
- Owner: Web presentation; Discovery owns rails/search; Engagement owns progress
- Phase: 09
- Requirement IDs: P09-R10, DSC-R01, DSC-R02, DSC-R03, DSC-R04, DSC-R05
- Created: 2026-08-29
- Updated: 2026-08-29

## Outcome

A viewer receives public home rails and bounded search in the initial HTML, then
an authenticated browser may add owner-authorized continue-watching without
serializing profile data into the server response or changing the public render.

## Current behavior

Search and home-owner capabilities are released through main `a3f969c`. PR34
exact `390b655` passed protected run33248598719, received a clean exact-head
confirmation, squash-merged, and exact-main run33249289718 passed. This branch now
server-renders bounded HomePublic/SearchTitles views and admits HomePersonalized
only through the isolated owner-confirmed profile client. Focused static, package,
schema and disposable browser/failure acceptance pass; the complete browser and
candidate gates remain before publication.

## Proposed behavior

Add exact Web documents matching `HomePublic`, `SearchTitles` and
`HomePersonalized`. Render public home rails and search through the existing
request-scoped Apollo preload and positive response projection. Add
continue-watching only after the browser establishes the selected profile in the
existing disposable private Apollo generation. Keep Catalog browse available as
an independent route when Discovery is unavailable.

## Boundaries

- Owning context: Web owns presentation only; Discovery owns projected rails and
  search; Catalog owns title metadata; Engagement owns progress.
- Affected services/packages: `apps/web`, Phase 09 documentation/evidence and
  existing Router operation compatibility only.
- Authoritative data: unchanged owner GraphQL responses; no Web persistence.
- Read models/caches: request-scoped public Apollo and disposable profile-scoped
  private Apollo; no Redux copy, browser persistence or cross-request cache.
- Trust boundaries: URL search parameters, public GraphQL response, local session
  cookie and profile-scoped private GraphQL response.
- External dependencies: existing Web, Router, Discovery, Catalog, Engagement and
  Identity runtimes.

## Invariants

- Public SSR sends no cookie, profile identifier or private owner credential.
- Server HTML and first browser render use the same bounded Apollo snapshot.
- Profile enhancement starts only after current Identity selection and is removed
  on session/profile change, expiry, page suspension or cancellation.
- Apollo owns all remote rail/search/progress state; Redux remains local shell and
  player interaction state.
- One failed or stale rail remains explicit and cannot erase usable siblings.
- Discovery failure does not block Catalog browse, title detail or playback.
- Search is at most20 results/page; home is at most10 titles/rail and three genres.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Discovery unavailable during public SSR | Sanitized home/search unavailable state; Catalog routes remain usable | existing Router/Discovery outcome |
| Home partial or fallback | Render only returned usable rails with explicit source/state text | existing rail outcome/fallback metrics |
| Empty or stale search | Distinguish no matches, stale projection and unavailable dependency | existing search outcome/quality metric |
| Invalid query/cursor/locale | Reject before browser/owner work; invalid route is not an empty result | Web/Router rejection only |
| Engagement unavailable | Keep public SSR unchanged; show private enhancement unavailable | Router partial/Engagement outcome |
| Profile/session changes | Cancel and discard old private client/cache; late data cannot render | existing private lifecycle state |

## Data and contracts

- Schema/migration: none.
- GraphQL: consume existing exact `HomePublic`, `SearchTitles` and
  `HomePersonalized` known operations without changing ownership/nullability.
- Events: none.
- Cache: add finite one-snapshot public home/search roots and finite private home
  roots; normalized public `Title` identity remains stable.
- Compatibility: documents must exactly match Router inventory and generated API.
- Retention/deletion: Web stores no profile/search/rail data outside in-memory
  request or private-profile client lifetimes.

## Security and privacy

- Authorization: owner-side Engagement authorization remains mandatory; the Web
  binds `profileId` to the current private scope and cannot substitute it.
- Input limits: query at most80 code points/160 UTF-16 units/eight normalized
  terms at the owner; cursor at most1280 safe URL characters; locale is `en` or
  `pt-BR`; page20; home10.
- Sensitive data: no profile, progress, cookie, private errors, endpoints or
  credentials in HTML, public Apollo snapshots, URLs, logs or evidence.
- Abuse cases: reject unknown operation substitution, foreign profile variables,
  oversized response collections, malformed identifiers/scalars and automatic
  retries; all browser work has the existing four-second deadline/cancellation.

## Implementation steps

1. Record the P09-R03 protected/main release and activate P09-R10.
2. Add exact documents, bounded variable/response projection and cache policies.
3. Render accessible public home rails and bounded search from SSR snapshots.
4. Add profile-scoped continue-watching through the existing private lifecycle.
5. Verify failure, hydration, accessibility, operation count and runtime journeys.
6. Update Phase 09 acceptance/evidence and complete initial/confirmation review.

## Tests

- Domain: URL query/locale/cursor normalization and response-shape bounds.
- Application: public snapshot allowlist, finite cache roots, private profile
  binding, partial owner failure and late-profile cancellation.
- Integration: generated schema and exact Router known-operation compatibility.
- Contract: Home/Search documents, nullability, profile ownership and no private
  fields in public artifacts.
- Browser: SSR with disabled/delayed JavaScript, zero automatic initial browser
  GraphQL, search traversal, empty/stale/unavailable states, profile enhancement,
  profile swap and Discovery isolation from Catalog/playback.
- Performance/failure: existing mobile budgets, hydration mark and bounded
  operation counts on a dedicated disposable runtime; no media encode or CPU loop.

## Evidence

- Commands: focused Web tests/build/lint; schema checks; affected candidate; one
  disposable browser/runtime acceptance.
- Raw artifact path: `evidence/phase-09/web-discovery-*.txt` and Phase 09 index.
- Acceptance result: initial local candidate and46/46 pass; published `b087bc5`
  passed protected run33252690275. Hosted review found three boundary defects;
  their batched correction passes Web110/110, build/scans, browser8/8 and the
  affected46/46 candidate. Hosted confirmation and release remain.
- Iteration gate: Web typecheck/build, focused node:test and scoped ESLint.
- Candidate gate: `pnpm check:changed`, schema compatibility and public-artifact scan.
- Heavyweight repeat triggers: changes to public preload/hydration, private profile
  lifetime, Router operation, runtime topology or browser-visible fallback repeat
  the affected browser/runtime proof. Pure prose does not repeat it.
- Review stopping rule: one complete initial review and one confirmation. Reopen
  only for requirement, security/data, hydration/availability or public-contract
  blockers; record speculative polish for its owning later phase.

## Rollback or recovery

Restore the prior Web home and remove only the additive discovery views/documents.
Owner services, projections, profile/progress data, retained media and Catalog
browse remain unchanged. A disabled Discovery service must leave browse/playback.

## Documentation updates

Web README, ADR-0036 implementation status, feature catalog, Phase 09 evidence and
repository memory.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
