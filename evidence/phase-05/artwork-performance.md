# Experiment P05-WEB-01: Responsive illustration and mobile baseline

- Status: IN_PROGRESS; artwork passes its checks, timing stability remains open.
- Date: 2026-08-27
- Source: unpublished feat/p05-web-ssr candidate based on bb39f35; this report is committed with its source.
- Owner: Web presentation; no Catalog or Identity data change.
- Requirements: P05-R07/P05-R08; supports R02/R05/R09/R10.

## Question and hypothesis

Can a rights-safe local illustration remain useful across viewport and image failures, and can the current public browsing/profile interaction meet the initial mobile budgets? The hypothesis requires each of three visits to meet all budgets, not only their average.

## Environment and variables

Linux/WSL x64, six available CPUs, 12543180800 bytes RAM; Node 24.19.0, pnpm 11.24.0, Next 16.3.3, React 19.2.8, Chrome 145.0.7632.159. Existing Docker development Web/Router/Catalog/Identity, PostgreSQL and Redis; no broker/media workload is involved. Web image: sha256:003475a0bede30bf1a161d408e3a6ba71cc6cf68e5e3a26c163a38f8868acf7a, subsequently inspected healthy.

Controlled workload: one actual published technical fixture, three fresh browser contexts, 390x844 at DPR 2, 4x CPU slowdown, 1.6 Mbit/s down / 750 kbit/s up / 150 ms latency. Browser cache is disabled; server and 768-pixel image cache are warmed explicitly. No concurrent build or browser suite was started. Host load is not isolated: later read-only samples reported one-minute load 4.52 and 6.72 on six CPUs. Other processes were not stopped.

Independent changes: source-owned artwork, finite image policy and a provider hydration mark. Dependent measurements: actual image/JavaScript encoded bytes, LCP/INP/CLS, mark time and browser query count. Instrumentation changes during investigation are recorded below, not attributed to application optimization.

## Implementation and rights

The force-static ImageResponse route produces a 1280x800 PNG during the build, with no request input or external asset. This is original generic Aster illustration under MIT, not acquired film artwork or a Catalog rights approval. Existing seed/rights records are unchanged. Phase 06 still owns actual title posters and object-storage delivery.

Cards use decorative alt beside their title; detail describes and credits the illustration. The fixed 16:10 area preserves a readable fallback when images fail, including without JavaScript. Cards load lazily; detail uses eager/high-priority loading. Next Image accepts only /artwork/aster-v1.png without source query, five widths, quality 75, no remote host/redirect/SVG/local-IP fetch, a 100 KiB upstream body and an 8 MiB disk-cache limit within the existing 32 MiB tmpfs.

## Commands and functional evidence

```bash
pnpm --filter @aster/web test
pnpm --filter @aster/web typecheck
pnpm exec eslint apps/web
pnpm unused:check
docker compose -p aster-p04-development -f infra/compose/compose.yml -f infra/compose/observability.yml -f infra/compose/demo.yml --profile observability up --build --no-deps --wait --wait-timeout 60 web
ASTER_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome ASTER_ROUTER_CONTAINER=aster-p04-development-router-1 pnpm --filter @aster/web test:browser
ASTER_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome ASTER_ROUTER_CONTAINER=aster-p04-development-router-1 pnpm --filter @aster/web exec playwright test test/browser/performance.spec.ts
```

18 Web tests passed; initial type/unused checks passed. Small lint corrections were applied; the candidate source gate is recorded at closeout below. Docker build identifies the PNG route as prerendered static content. agent-browser loaded the rebuilt browse route, inspected its controls and screenshot, and reported no errors. No retained volumes or owner services were rebuilt.

The complete browser run passed all 14 functional journeys, including the three artwork tests, but failed the timing test on a 256 ms INP visit. Do not describe that run as 15/15. Existing SSR proof still shows one Router Browse, zero initial browser GraphQL/prefetch and zero console errors. Four real paused-Router routes remain useful without JavaScript and explicit recovery works. Router was restored by the test; only newly created profile fixtures were removed through Identity.

Actual artwork outputs:

| Width | WebP bytes |
|---:|---:|
| 160 | 852 |
| 320 | 1890 |
| 480 | 3024 |
| 768 | 5102 |
| 1280 | 9660 |

Original PNG: 60282 bytes; SHA-256 109beda62b9c4ff2a608a948409394f2fdb54852da39d229383af9b2f370b8a6. All outputs meet the predeclared 100 KiB bound. PNG fallback succeeds, repeated WebP returns cache HIT, and eight invalid source/width/quality requests return 400. Actual browser selection is 768 pixels on 390px/DPR2 and 480 on 1280px/DPR1. Real navigation and image fallback pass with JavaScript enabled and disabled.

## Laboratory results and raw evidence

[Machine-readable samples and resource inventory](artwork-performance.json) retain the failed complete-run samples and the latest focused attribution run. Measurement is injected by dev-only web-vitals 6.2.1; no analytics endpoint or runtime dependency is added. The unmodified Apache-2.0 package has no runtime dependencies or install/postinstall hook; lockfile change adds one package. Installed LICENSE SHA-256: bfdeded4040e05da31ca9b6239dc83bd23fa26ac8db87342a7ca4363f68916ff.

The current test captures initial encoded resource bytes, explicitly refreshes Catalog, opens the signed-out profile dialog and closes with Escape. A real navigation to about:blank finalizes metrics. It requires all three actual metric callbacks; zero CLS is not fabricated from a missing sample. The hydration mark is one public-provider effect after hydration, measured from navigation start, not the duration of every component.

| Metric | Budget | Latest focused visits |
|---|---:|---|
| Initial JavaScript | 256000 bytes | 240853 / 240853 / 240853 |
| Cumulative JavaScript after dialog | 358400 bytes | 259102 / 259102 / 259102 |
| Initial image responses | 204800 bytes | 10204 / 10204 / 10204 |
| LCP | 2500 ms | 1624 / 1776 / 1652 |
| INP | 200 ms | 96 / 96 / 72 |
| CLS | 0.1 | 0 / 0 / 0 |
| Provider hydration mark | 3500 ms | 2910.4 / 2847 / 2962.1 |
| Initial browser GraphQL/prefetch | 0 | 0 / 0 / 0 |

The cache-disabled protocol includes two image transfers; these are both counted, not deduplicated away. Cross-origin GraphQL Resource Timing byte fields are zero without Timing-Allow-Origin, so they are not treated as zero-byte GraphQL operations. Query-count assertions are separate.

## Failed experiments and interpretation

The first measurement harness incorrectly expected headless tab switching to produce hidden visibility; it failed without completing a sample. Real document navigation fixes finalization. Initial basic-library visits then passed, but full-suite confirmation exposed INP 256 ms. Diagnostic basic-library runs saw INP up to 408 ms and hydration 5480.8 ms. Disabling trace/screenshot recording did not alone resolve variability: a subsequent run still saw INP 280 ms and hydration 4165.2 ms. No budget was increased.

The current attribution-library run passes three visits in 15.5 s (16.8 s including runner). Its longest recorded interaction scripts are React click handlers of 43–56 ms; that does not prove the cause of earlier spikes. Timing stability remains under investigation. Avoid repeating runs merely to select a green sample or blaming tracing/host load as a proven sole cause. The raw failed samples remain evidence.

This is a small synthetic workload and an instrumented shared-host laboratory, not field p75, complete route coverage or a hosted SLO. Automated image semantics do not replace manual screen-reader review. Client-bundle secret scans, complete accessibility, stable timing confirmation, clean-checkout acceptance and protected publication remain open.

## Decision, review and rollback

Keep the functional artwork and reproducible diagnostic harness; continue performance investigation alongside the remaining Web acceptance work, with requirements unchanged. Do not publish Phase 05 yet. Source review preserves the explicit Apollo request guard, local component failure state, fixed image origin and existing data ownership. No speculative application optimization was made without an identified cause.

Rendering/asset/optimizer/dependency/protocol changes repeat affected browser/laboratory checks. Existing unchanged seed/media/isolation evidence remains supporting proof; this slice does not invalidate those boundaries. Rollback removes the Web image route/component, policy, performance mark and dev tool without product-data changes.

## Source checkpoint closeout

`pnpm check:changed` passed 58/58 tasks, 43 cached, in 3m8.983s, after the browser experiments. This includes the current production build, Web unit tests/types, lint, unused-code, formatting, architecture, documentation/state and secret checks. Subsequent changes are evidence/state prose only and receive focused checks. The earlier functional browser results remain applicable to the unchanged Docker application; the later test-only attribution/trace changes do not alter it. No full 15-test acceptance or timing-stability claim is made. No remote push, PR or pipeline was created.

## Sources

- [Next ImageResponse](https://nextjs.org/docs/app/api-reference/functions/image-response) and [Image options](https://nextjs.org/docs/app/api-reference/components/image); configuration was also checked against installed 16.3.3 types and the actual optimizer.
- [Google web-vitals](https://github.com/GoogleChrome/web-vitals) and its installed 6.2.1 attribution declarations; measured INP is not a hand-rolled approximation.
- [Playwright tracing guidance](https://playwright.dev/docs/best-practices): tracing can materially perturb performance; it is disabled only in the laboratory test, not the functional suite.
