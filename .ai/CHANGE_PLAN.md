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
- Phase 04 release is the base; Phase 05 publication still requires complete acceptance.

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
- Acceptance result: the current boundary checkpoint passes 58/58 source tasks and all 18 functional browser journeys, including fourteen axe scans and actual bundle/HTML isolation. Actual screen-reader review, timing stability and clean-checkout acceptance remain open.
- Iteration gate: cheapest changed adapter/cache/component checks and local production build.
- Candidate gate: affected source gates, real browser journeys and required security/accessibility checks.
- Heavyweight repeat triggers: rendering, hydration, transport, seed, packaging or asset changes repeat the affected browser/Docker measurements; prose does not.
- Review stopping rule: one initial and one confirmation round; additional rounds only for requirement/security/data/availability/public-contract blockers.

## Rollback or recovery

Stop only the owned Web/proof services and return to the released HTTP-only topology. Do not remove retained PostgreSQL data. Retire only the explicitly identified synthetic seed through Catalog if removal is needed. The branch is already based on the Phase 04 squash; no predecessor wait remains.

## First-slice decisions

Critical public content has no Suspense/loading boundary: actual disabled-JavaScript testing proved that streamed replacement otherwise hides it. Public HTML waits for the four-second-bounded query; profile/client-only loading can remain independent. The local seed uses only the fixed source-owned ADR-0016 technical fixture and synthetic non-delivery media references; it refuses existing edits/takedowns. The Web receives no initializer or private Router credentials. Detailed scope and commands are in apps/web/README.md.

## Profile slice

Public source checkpoint is c0b7585 (58/58 source tasks). Implement ADR-0018: exact Web-origin CORS/fetch metadata, separate interaction-only Apollo session cache with cancellation/replacement, Redux dialog coordination and the minimal accessible profile-selection/create flow. Identity remains authoritative; no owner transport or persistence changes. Verify keyboard/cookie/negative-origin behavior against the real Router before publication. Mutation retries are explicit only after owner-state refresh. Preserve all retained profiles and data.

## Documentation updates

Update actual Web/Docker commands, UI inventory, phase evidence and repository memory at meaningful checkpoints.

## Docker slice

Add `infra/compose/demo.yml` as an explicit overlay of the existing runtime profile. It adds the standalone Web on loopback 3000 and enables the fixed synthetic seed in the existing finite Catalog initializer after migrations. The API-only topology remains unchanged. Web joins only the Router edge network, receives only the public Router URL, and has no database or private trust mount. Use the already pinned Node image, a non-root/read-only runtime, finite CPU/memory/PIDs, a bounded disposable image cache and a process-liveness endpoint; upstream readiness and degraded browsing remain separate checks.

Package the existing measured `evidence/phase-05/generated-media.json` report, not media bytes or FFmpeg. This reuses the reviewed local technical fixture; it is not a fresh media-generation run, playable delivery, or acquired-film approval. The initializer retains explicit local/operator/seed activation, deadlines, cancellation and the existing idempotent refusal to overwrite modified or retired data. No automatic seed is added to the normal Catalog server.

Actual Docker acceptance found that pinned Node Fetch discards explicit Host. Server-only HTTP now supplies the fixed public Host/Origin, no forwarded private headers, a shared 16-request pool and existing bounded body/deadline behavior. Router policy and request-scoped Apollo ownership are unchanged. Six initial browser failures are recorded; the corrected Docker checkpoint befb432 passes all eight journeys and 16 Web tests. The subsequent public recovery slice below addresses raw error HTML and explicit retry separately from liveness.

Iteration gate: Catalog seed tests, Web checks and Compose/source policy tests. Candidate evidence: one fresh project with the exact Docker-only command, repeat initialization without duplicate writes, SSR/profile browser checks, private-network/credential inspection, and bounded Web shutdown/recovery. Packaging, initialization, runtime configuration or generated-report changes invalidate these checks; prose alone does not. Preserve existing projects and volumes; stop only owned conflicting processes during loopback proof and restore them afterwards. The existing review stopping rule applies.

## Public recovery slice

Docker checkpoint befb432 is locally accepted. Implement P05-R06/P05-R10 in the existing public Catalog consumers: represent expected query failures with Apollo's `errorPolicy: all` and offer one user-triggered read refresh with a pending announcement. Keep the previous snapshot visible and explicitly stale only during that four-second-bounded refresh; remove it when the current query fails, rather than inventing a long-lived freshness guarantee. An initial failure must render useful sanitized HTML, never an empty Catalog or a missing-title success. Provide a normal reload link for disabled JavaScript. No private state, automatic retry, polling, new endpoint or persistence change.

Both preload and consumer use the same error policy. Positive transport projection and complete-response validation remain in force; partial upstream errors cannot become successful public data. A transition keeps already rendered content visible during refresh, with no Suspense boundary around critical initial HTML. Cached metadata is informational only and never authorizes playback or confirms current rights. Unknown render errors retain the route boundary.

Iteration gate: focused Web transport/cache tests and typecheck. Candidate gate: real Docker browser SSR outage/recovery, disabled-JavaScript failure HTML, delayed refresh, stale state, explicit retry, sanitized error, and existing no-duplicate hydration/profile journeys. Add deterministic empty/missing-title browser responses without writing fake Catalog product records. Repeat only Web build/browser evidence for this rendering change; Catalog seed/media and isolated network policy are unchanged. Keep one initial review and one confirmation; defer non-blocking speculative improvements.

The pinned Apollo integration's automatic replay required an explicit-consumer callback guard in the browser link; a preload-context marker alone was insufficient. Confirmation passes 17 Web tests, 11 browser journeys and 58/58 source tasks. See evidence/phase-05/public-recovery.txt for failed iterations, actual commands and limits. Rollback returns to befb432 without data changes. Artwork/performance/clean-checkout acceptance and Phase 05 publication remain open.

## Responsive artwork slice

Implement P05-R07 and the image part of P05-R08 in Web only. Render a deterministic, source-owned abstract PNG at build time with the installed Next ImageResponse, then serve finite responsive variants through next/image. It is generic Aster illustration, not acquired film artwork or Catalog metadata. Keep the existing seed and rights records unchanged; actual title-poster generation and object-storage delivery remain Phase 06.

Only the exact versioned local artwork path is optimizable: no remote hosts, arbitrary local routes, source queries, redirects, SVG or local-IP fetches. Limit widths, quality, upstream bytes and disk cache within the existing Docker resource bounds. Cards are decorative beside their title; the detail figure describes and credits the illustration. Missing images retain a fixed-ratio readable fallback, including without JavaScript. Loading policy is explicit and must not add GraphQL traffic.

Iteration gate: focused policy tests, Web types and production build. Candidate gate: real optimized PNG/WebP responses, width/quality/path rejection, responsive selection at mobile/desktop sizes, image failure with and without JavaScript, accessible names and all existing browser journeys. Define a 100 KiB per-image response budget before measuring. Asset, layout or optimizer changes repeat this evidence; unchanged seed/media/network-isolation proof remains supporting evidence. One initial review and one confirmation; rollback removes the Web asset/component/config without touching data.

## Web laboratory baseline

Implement the remaining P05-R08 measurement contract with exact dev-only web-vitals 6.2.1 (Apache-2.0, no runtime dependencies or install/postinstall hook). The unmodified package stays outside application imports and production artifacts. Use three cold-browser visits to the real seeded Docker browse page, warm server/image cache, 390x844 viewport at DPR 2, Chrome CDP 4x CPU slowdown and 1.6 Mbit/s down / 750 kbit/s up / 150 ms latency. No concurrent builds or browser suites.

Before measurement, set per-visit budgets: 250 KiB initial JavaScript encoded bytes, 350 KiB cumulative JavaScript after opening Profiles, 100 KiB per image / 200 KiB initial image bytes, LCP 2500 ms, INP 200 ms, CLS 0.1, public-provider hydration mark within 3500 ms of navigation start, and zero initial browser GraphQL/prefetch requests. The mark is one local Performance API entry after provider hydration, not a duration for every component. Exercise explicit refresh, profile dialog opening and Escape; measure with Google's library rather than approximate INP. Capture raw samples, environment, source/image identity and limits. This is a small instrumented laboratory baseline, not field p75 or a hosted SLO.

Iteration: Web types and focused laboratory test. Candidate: all browser journeys after the same production build, affected source gate, reviewed raw measurements. Asset, application/dependency, layout or performance-protocol changes invalidate affected measurements. Accessibility/manual screen-reader, bundle secret scans and full phase clean-checkout acceptance remain separate obligations. Rollback removes the measurement mark and dev tool without product data changes.

The actual three-visit attribution run passes, but prior complete and diagnostic runs missed INP/hydration, including after disabling trace recording. Keep those raw results and leave timing stability open. The laboratory now uses the attribution build, disables browser cache and tracing, and finalizes metrics through real document navigation because headless tab switching did not hide the page. No threshold was increased and no speculative application fix is claimed. Bundle secret scans and accessibility can progress within this same item while timing is investigated.

## Public-artifact and accessibility acceptance

Close P05-R09 with a bounded build-time scan of every emitted public JavaScript/CSS/JSON asset, rejecting source maps, private Aster configuration/owner endpoints and credential signatures. Missing or empty output fails. Reuse the redacting checks on actual SSR HTML and browser-loaded chunks, and verify signed-in HTML never serializes the session cookie or the disposable profile fixture. Negative fixtures must demonstrate detection; this is a regression check for named boundaries, not proof that arbitrary obfuscated secrets are impossible. No production credentials are read or added. The normal Web build runs the scan, including Docker and protected source CI.

Complete automated accessibility coverage for public routes and signed-out, profile-list, create, busy and failure dialog states. Use the reviewed dev-only axe Playwright adapter under ADR-0019. The dependency-review action ignores package URL versions, so use two package-scoped license exceptions with separate exact-version/dev-only/lock checks; Aster remains MIT. Preserve keyboard/focus/reduced-motion checks and record screen-reader review separately from automated accessibility-tree inspection. No unused UI primitives or private data in evidence.

Iteration gate: scanner negative fixtures, Web unit/types, focused browser scans. Candidate gate: rebuilt public artifacts, real Docker HTML/profile isolation and accessibility journeys, affected source checks. Rendering or runtime dependency changes repeat relevant browser/performance evidence; test-only additions do not invalidate previous media/seed/network-isolation experiments. Existing initial/confirmation review stopping rule applies. Rollback removes the checks/dev tool and its narrow CI exceptions without data changes. Timing stability and full clean-checkout acceptance remain open until independently proved.

The current runtime checkpoint passes all eighteen functional journeys. It fixes an actual busy-state focus escape by focusing enabled Close before paint and announcing pending work. Full axe scans cover stable states; rapid semantic/focus checks cover the transient state within the real four-second deadline. Image-covered fallback contrast and modal focus incompletes retain explicit supplementary evidence. See evidence/phase-05/web-boundaries.md for failed iterations, actual scope and remaining screen-reader/performance checks. No product timeout or accessibility rule was relaxed.

## Completion checklist

Performance confirmation will use two separately invoked three-visit blocks against the unchanged production image and existing budgets, with no retries. Before each block, record source/image/browser identity, host load and CPU/memory samples; run no overlapping build or browser suite. Require one-minute WSL load below half of its six CPUs and at least 70% idle in the two live vmstat samples; otherwise defer measurement, not the functional work. Record post-run host samples and every result. A budget failure stops confirmation and requires attribution-based diagnosis rather than more runs to select success. This defines a small reproducible quiet-host baseline, not performance under arbitrary host contention or field SLOs.

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
