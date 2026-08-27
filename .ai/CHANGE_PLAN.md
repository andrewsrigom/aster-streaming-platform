# Work Item: Server-rendered Catalog and deterministic browser state

- Status: IN_PROGRESS
- Owner: Web presentation; Catalog and Identity retain product data
- Phase: 05
- Requirement IDs: P05-R01, P05-R02, P05-R03, P05-R04, P05-R05, P05-R06, P05-R07, P05-R08, P05-R09, P05-R10, P05-R11
- Created: 2026-08-27
- Updated: 2026-08-27

## Outcome

The local browser will render public Catalog/title/attribution content before JavaScript, hydrate Apollo without a duplicate initial request, and exercise profile selection with separate local interaction state.

## Current behavior

Phase 04 is released at b6c99c4 after exact-head protected CI and successful post-merge run 33104100966. This unpublished branch is rebased onto that squash. Public SSR routes, positive public-data projection, finite normalized cache retention and an opt-in Catalog-owned seed pass focused and browser checks. Default catalogs remain empty until explicit seeding; the development stack contains the single labeled technical fixture. Full phase acceptance remains open.

## Proposed behavior

Start with a real Next.js App Router browse/title slice through Apollo Router, deterministic public query preloading and narrow UI primitives. Add the explicit Catalog-owned synthetic seed, profile flow, responsive artwork, Docker packaging and complete browser acceptance before closing this phase. No video player or invented film approval.

## Boundaries

- Owning context: Web owns presentation; Catalog owns publication, rights and public metadata; Identity owns sessions/profiles.
- Affected paths: apps/web, first-party operation inventory, Catalog local seed, Compose/Docker packaging and affected tooling.
- Authoritative data: PostgreSQL through existing owner use cases; no Web SQL, Redis or owner imports.
- Read models/caches: per-request server Apollo cache; browser normalized remote cache; Redux contains only coordinated local interactions.
- Trust boundaries: public browser, server-rendered serialized data and public Router API. No private owner credential enters Web.
- External dependencies: exact Next 16.3.3, React 19.2.8, Apollo Client 4.2.12 and integration 0.14.5; compatible minimal UI/test dependencies, frozen lock and reviewed install scripts.

## Invariants

- Public catalog/title content remains useful without client JavaScript.
- Public query results never contain cookies, operator data or server configuration.
- RSC preloads client-owned query data without a second independent RSC-rendered copy.
- Session/profile changes clear the relevant browser cache; no durable data in Redux.
- No publication before Phase 04 release; rebase onto its squash and repeat affected gates.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Router unavailable or late | Bounded accessible error with explicit retry | Sanitized outcome, no response payload |
| Empty Catalog | Honest empty state and documented opt-in seed | No synthetic success |
| Invalid locale, cursor or title ID | Reject or canonicalize before the query | No input values in labels |
| Slow or absent JavaScript | Server-rendered public content and normal links work | Browser acceptance evidence |
| Session expired or changed | Owner authorization and cache invalidation | No credentials in snapshots/logs |
| Incomplete rights or invalid media report | Seed refuses publication | Bounded local diagnostic |

## Data and contracts

- Schema/migration: no Web persistence; seed uses Catalog contracts and existing generated-media attestation.
- GraphQL: versioned first-party documents, stable IDs, explicit locale and bounded keyset pages.
- Events: existing owner outbox behavior only.
- Cache: explicit entity/connection policies and finite page retention; no cross-request server singleton.
- Compatibility: existing HTTP-only demo remains available.
- Retention/deletion: seed is explicit and idempotent; no overwrite of unrelated titles or retained data.

## Security and privacy

- Authorization: Identity remains authoritative. Any browser-origin extension must be explicit, narrow and covered by real CSRF/CORS tests before profile use.
- Input limits: bounded query inputs, response bytes and outbound deadlines/cancellation.
- Sensitive data: server-only modules, public-field-only preload, escaped transport and client bundle/snapshot scans.
- Abuse cases: forged browser headers, cache cross-contamination, malformed responses and unapproved artwork/media.

## Implementation steps

1. Add the pinned Web package, minimal UI foundation and real public SSR queries.
2. Verify safe Apollo hydration, locale and cache behavior with focused tests.
3. Add repeatable Catalog-owned seed and real profile flow with narrow origin policy.
4. Package the same Web app in Docker and exercise complete browser/error/keyboard journeys.
5. Record bundle, image, hydration and laboratory performance budgets and measurements.
6. Review one coherent candidate, verify clean startup and complete protected release.

## Tests

- Domain/application: existing owner invariants; focused seed idempotency and client-state tests.
- Integration: real Router/Catalog/Identity; no replacement data endpoint.
- Contract: first-party operation/schema compatibility and public snapshot filtering.
- Browser: SSR HTML, disabled/slow JavaScript, hydration, no duplicate request, locales, navigation, keyboard/dialog/profile flow and negative bundle scans.
- Performance/failure: measured initial JS/image/operation and Web Vitals laboratory budgets; Router outage and retry.

## Evidence

- Commands: focused Web tests/types/build during iteration; pnpm check:changed for a coherent candidate.
- Raw artifact path: evidence/phase-05/.
- Acceptance result: first public slice passes eight Web, 98 Catalog and four browser checks plus an actual one-operation Router assertion. Profile, artwork, failure/performance and Docker phase acceptance remain open.
- Iteration gate: cheapest changed adapter/cache/component checks and local production build.
- Candidate gate: affected source gates, real browser journeys and required security/accessibility checks.
- Heavyweight repeat triggers: rendering, hydration, transport, seed, packaging or asset changes repeat the affected browser/Docker measurements; prose does not.
- Review stopping rule: one initial and one confirmation round; additional rounds only for requirement/security/data/availability/public-contract blockers.

## Rollback or recovery

Stop only the owned Web/proof services and return to the released HTTP-only topology. Do not remove retained PostgreSQL data. Retire only the explicitly identified synthetic seed through Catalog if removal is needed. Preserve the frozen Phase 04 branch and rebase this unpublished dependent work onto its squash.

## First-slice decisions

Critical public content has no Suspense/loading boundary: actual disabled-JavaScript testing proved that streamed replacement otherwise hides it. Public HTML waits for the four-second-bounded query; profile/client-only loading can remain independent. The local seed uses only the fixed source-owned ADR-0016 technical fixture and synthetic non-delivery media references; it refuses existing edits/takedowns. The Web receives no initializer or private Router credentials. Detailed scope and commands are in apps/web/README.md.

## Documentation updates

Update actual Web/Docker commands, UI inventory, phase evidence and repository memory at meaningful checkpoints.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
