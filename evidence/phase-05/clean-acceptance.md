# Phase 05 — Clean-checkout acceptance

Status: IN_PROGRESS. Native screen-reader review remains separate and incomplete.

## Build-context correction

The first preflight incorrectly treated missing explicit verifier-path declarations as proof that Docker omitted the files. A real build from clean source 60364aa passed, including the public-build scanner, and inspection of the earlier running image showed the same scanner command and axe dev dependency. This contradicted the inference.

[Docker's documented matching](https://docs.docker.com/build/concepts/context/#syntax) ignores trailing slashes. Directory exceptions such as `!apps/web/**/` and `!evidence/` therefore admitted unlisted descendants. The old policy test compared text but did not exercise those matching semantics. No claim of an observed production secret leak is made.

`node tools/verify-docker-context.mjs` now runs a network-free scratch build of thirty synthetic canaries and exports only to an owned temporary directory. The first run failed: ten of fifteen forbidden files were included, covering browser traces/reports, unreviewed media/text and evidence/tool artifacts. Five existing exclusions (environment, key, dependency, compiled-output and unrelated documentation cases) still held. After removing directory exceptions and retaining explicit file patterns, the actual Docker result contains exactly fifteen approved files and none of the fifteen forbidden files. The two build verifier files remain explicitly included. Temporary fixtures are removed in `finally`; no runtime containers, published images or retained data are changed.

The probe is required once in the existing protected source job for platform changes, with a one-minute CI deadline and a thirty-second child-process deadline. Its own path selects that CI scope. Forty-seven focused platform, classifier and CI-policy tests pass. No pipeline has been submitted for this unpublished candidate.

## Clean build and startup

Disposable checkout: `/tmp/aster-p05-clean-pDkoZQ`. Proof project: `aster-p05-clean-proof`. Initial read-only inventory found no containers, networks or volumes with that project label. Docker context is local `default`; Engine 26.0.0, Compose 2.26.1, Linux/WSL amd64. Git checkout initially had no node_modules or .next output; source status was clean. Registry access and cached base layers are available, so this is not an empty-cache or offline claim.

The strict-context build from fc7aba3 passed and emitted Web image `sha256:384f166236d8c545ef73eacfee2a886cf0bb6c26b16693e605abec26cbd2a1c5`. Frozen host installation then passed (470 reused packages, zero downloads). Host Node is used for verification, not Docker startup.

The first uncached source gate stopped after 33 successful tasks when the Express diagnostic returned a null exit status after 5.24 seconds. Its five-second process wrapper includes cold imports and hid subprocess errors. The same diagnostic completed in 622 ms in isolation. The test now reports the error and allows fifteen seconds for the whole subprocess; its actual two-second HTTP deadline, one-second drain grace and response assertions remain unchanged. At 56a1320, `pnpm check --force` passed 58/58 tasks, zero cached, in 132.078 seconds. This is test-harness remediation, not an application latency improvement.

The documented startup passed from clean checkout 56a1320:

```bash
docker compose --project-name aster-p05-clean-proof --file infra/compose/compose.yml --file infra/compose/demo.yml --profile runtime up --build --wait --wait-timeout 120
```

Only the identified development Web/Router were stopped to release ports 3000/4000. Fresh proof volumes/networks were created; Catalog applied migrations 1/2/3 and published the fixed synthetic seed. An actual browser loaded home, navigated to Collection, displayed the title and reported no page errors.

Runtime inspection confirmed UID/GID 1000, read-only root, all capabilities dropped, no-new-privileges, one CPU, 512 MiB memory and 64 PIDs. Web had only the edge network, no volume mount and no private-owner/database environment variables. Its only writable application path was the bounded 32 MiB image cache. All three dev tools (`@axe-core/playwright`, `axe-core`, `web-vitals`) failed runtime resolution as intended. Earlier [seed idempotency/refusal and lifecycle evidence](docker-runtime.txt) remains applicable: those contracts did not change.

## Refresh regression and confirmation

Initial browser acceptance passed 17/18 scenarios in 124.260 seconds. Refresh missed its pending state. The trace shows zero browser GraphQL requests and an unavailable snapshot 15 ms after the click completed, disproving a four-second network timeout as the explanation.

The installed Apollo option comparator uses [function-source equality](https://github.com/benjamn/wryware/blob/main/packages/equality/src/index.ts): different consumers can compare equal while closing over different request flags. A focused shared-query route-change regression reproduced this against the old image: expected one explicit request, observed zero. The previous consumer's closed flag was retained.

Source e130e8e adds a stable per-consumer Symbol to local query options, forcing callback-owner comparison to differ. It is not rendered, serialized or transmitted. No automatic-replay guard, cache ownership, duplicate-click exclusion, transport deadline or private-data boundary was removed. Source review checked the actual comparator/query-reference implementation and both stale-state and remount paths.

Only Web was rebuilt. Image `sha256:f295e856d810619a3a6d4011d07ad99d2d8025aec184078b9f0bd1f86ac3e6f9` passed its public scan: 27 entries, 22 JavaScript files, 984317 bytes, zero findings. All 19 browser scenarios then passed in 74.076 seconds without retries/skips. They include both regressions, fourteen axe scans, authenticated HTML isolation, disabled JavaScript, Router outage/recovery and zero automatic initial GraphQL/prefetch. Incomplete axe results retain their explicit contrast/focus supplements. [Raw before/after evidence](clean-browser.jsonl).

Commands from the clean checkout, with `ASTER_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome` and `ASTER_ROUTER_CONTAINER=aster-p05-clean-proof-router-1`:

```bash
pnpm --filter @aster/web exec playwright test test/browser/accessibility.spec.ts test/browser/artwork.spec.ts test/browser/profiles.spec.ts test/browser/public.spec.ts test/browser/public-artifacts.spec.ts test/browser/recovery.spec.ts
pnpm check
```

Final source e130e8e passed 58/58 tasks, 43 cached, in 48.789 seconds. The prior uncached gate covers unchanged owners/platform code; final Web tests, types, build and affected static checks ran again. The actual Docker-context probe still passed fifteen included/fifteen excluded canaries.

## Cleanup and restored demo

Label/mount checks confirmed that the three proof volumes belonged exclusively to this project. `down --volumes` with the same Compose project/files/profile removed only its containers, two networks and three disposable volumes. Post-cleanup inventories are empty. Synthetic test data can be regenerated; retained `aster_postgres-data` and `aster-p04-development_postgres-data` remain.

Development Web/Router were restored with the base/observability/demo overlays and `--profile observability up --build --no-deps --wait --wait-timeout 60 web router`. Both are healthy and real browser navigation succeeds. Development Web image `sha256:1a1a10c44282573f33538b9e4c297e964f3450a7203d2e6845c8b6b54ef400f8` reuses all eleven filesystem layers of the accepted proof image; the cached build changed no application assets. Router remains `sha256:76b37d0452e418ffe2c5f05d4e58dda9986bc2b84d0fadf55ae731c043604561`.

## Remaining

Confirm final-image laboratory budgets under the predeclared quiet-host conditions and complete actual screen-reader review before protected publication. Other workspace builds/browser runs occupied the host. The 19:55 preflight found one-minute load 4.67 on six CPUs and active headless browsers, so no timing run started; no unrelated process was stopped. Preserve the prior accepted-image baseline and all timing misses. These source/platform/browser results do not claim reader acceptance, final-image performance or Phase 05 release.
