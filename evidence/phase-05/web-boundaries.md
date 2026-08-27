# Public artifacts and accessibility checkpoint

Date: 2026-08-27. Requirements: P05-R05, P05-R09, P05-R10, P05-R11. This verifies the named checks below, not complete Phase 05 or product-wide accessibility.

## Source and environment

Source is this checkpoint on `feat/p05-web-ssr`, based on f9d67cf. Tested Docker Web image: `sha256:0c1641b4de7113f48a2dcc7472571e2edd98b8c75fc20f17c49959862faad228`. Node 24.19.0, pnpm 11.24.0, Chrome 145.0.7632.159, Next 16.3.3, React 19.2.8; Linux/WSL amd64 and existing `aster-p04-development` owners. Later changes only refined tests/policy/evidence, not the tested application behavior.

Raw measurements and redacted engine results: [web-boundaries.jsonl](web-boundaries.jsonl). JSON Lines retains individual records without duplicating complete HTML, credentials, private profile values or browser traces. All fourteen full axe reports retain passed/inapplicable rule inventories and incomplete results.

## Commands and workload

From the repository root:

```bash
pnpm --filter @aster/web test
node --test tools/verify-ci-policy.test.ts
pnpm --filter @aster/web typecheck
docker compose -p aster-p04-development -f infra/compose/compose.yml -f infra/compose/observability.yml -f infra/compose/demo.yml --profile observability up --build --no-deps --wait --wait-timeout 60 web
ASTER_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome ASTER_ROUTER_CONTAINER=aster-p04-development-router-1 pnpm --filter @aster/web exec playwright test test/browser/accessibility.spec.ts test/browser/artwork.spec.ts test/browser/profiles.spec.ts test/browser/public.spec.ts test/browser/public-artifacts.spec.ts test/browser/recovery.spec.ts
```

The build includes `scripts/verify-public-build.ts`. The same verifier also scanned a copy of every static asset from the actual running container at `/tmp/aster-p05-public-hBvqP2/static`. Runtime resolution checks for `@axe-core/playwright`, `axe-core` and `web-vitals` all returned MODULE_NOT_FOUND. Agent-browser visually checked the rebuilt collection/profile routes and modal; no browser error was reported.

## Results

- All 18 functional journeys passed in 90.389 seconds, zero skipped/flaky tests. They include existing no-JavaScript, hydration, profile/cookie/cache isolation, image, Router outage and explicit-retry behavior. Router was restored afterwards.
- The actual container has 22 JavaScript assets plus one CSS asset, 985029 uncompressed bytes, scanned with zero named-boundary findings. This total inventory is not the initial network transfer budget. Hashes are retained per asset.
- Six real public HTML responses and eighteen browser-loaded assets, including the lazy profile code, passed. Five authenticated HTML routes contained none of the tested cookie value, disposable profile ID or display name, and returned no Set-Cookie. Only the test-created profile was removed through Identity.
- Fourteen default axe-core 4.13.0 scans passed with zero violations: five routes at 390 and 1280 pixels, plus signed-out, profile-list, create and unavailable dialogs. No rule or subtree was excluded. The busy state uses rapid real-browser status/disabled-control, accessibility snapshot and bidirectional focus checks within the unchanged four-second request deadline.
- Six image-covered fallback contrast results were incomplete in axe. Their actual foreground `rgb(173, 183, 173)` and background `rgb(25, 32, 28)` measure 8.02847:1, above 4.5:1. Existing image-failure tests also preserve layout/navigation with and without JavaScript.
- Four modal focus results were incomplete in axe. Supplementary checks prove the background main is absent from accessible roles, attempted background focus returns inside, and twelve forward plus twelve backward tabs stay in each stable modal state. Busy-state checks additionally prove Close remains focusable after the initiating action is disabled.
- Iteration checks passed 22 Web unit tests, 17 CI-policy tests and Web typechecking. Final source gate is recorded at closeout below.

## Findings and corrections

The first scanner test exposed nested Flight/JavaScript escaping; normalization now handles the tested Unicode/hex/slash/backslash forms. Negative fixtures also reject private configuration/endpoints, cookie/key/token signatures, maps, links, invalid UTF-8, missing/empty output and oversized artifacts. This is regression detection of named boundaries, not a universal secret detector or replacement for positive response projection and owner authorization.

Initial accessibility assertions used incorrect page headings; they were corrected against actual source. Axe incomplete results were reviewed, not discarded. Runtime focus testing found that a disabled initiating action could remain Radix's last focus target, allowing attempted background focus to escape. An onFocusOutside-only correction did not solve it. The modal now moves focus to its enabled Close control when busy begins, before paint, and announces the pending operation. It remains lazy-loaded, with no public Apollo/Redux ownership change.

Running a full axe scan and long focus traversal while holding a mutation could outlive its four-second deadline on this shared host, producing a changing-state contrast result and a real unavailable response. The final harness inspects the transient state promptly, releases the request, and performs full scans on stable states. No production timeout, rule or color threshold was relaxed. The original failed experiment is not counted as a product contrast violation or passing scan.

The first asset-copy shell command lost its temporary-path variable and failed before copying/scanning. Repeating with the explicitly resolved directory above succeeded. No root path or retained data was removed.

## Licensing, limits and review

[ADR-0019](../../docs/adr/0019-accessibility-test-tooling.md) accepts the two unmodified MPL-2.0 test packages under the standing authorization, retains Aster's MIT license and narrows CI exceptions to those packages. Exact versions/dev placement/install hooks/lock entries and actual bundled licenses have tests. No engine is shipped in the Web runtime.

Actual screen-reader review is still required; accessibility-tree inspection does not prove spoken output. Clean-checkout full-phase acceptance and protected publication remain open. Performance was deliberately not rerun: one-minute host load was 7.19 on six logical CPUs, with unrelated work active. Preserve earlier timing misses and budgets; these functional results make no new timing-stability claim.

Initial source review checked public-only transport, lazy state ownership, bounds, empty-output failures, redacted diagnostics and package-scoped policy. It added duplicate-license-option rejection to prevent an exception override. Confirmation and the final source gate are recorded below. Prior seed/media/network-isolation proof remains supporting evidence: those paths and contracts did not change. Rollback removes this Web/test-tool checkpoint without touching durable data.

## Closeout

`pnpm check:changed` passed 58/58 tasks, 45 cached, in 33.182 s. Earlier attempts found a missing active requirement ID in the resume paragraph and three lint findings (an unnecessary regex escape, string spread in an ASCII fixture and a non-null assertion in the contrast test). These were corrected without relaxing policy or changing application behavior. Confirmation review found no remaining blocker in this checkpoint. Later evidence/state prose receives focused checks; the unchanged Docker browser results remain applicable.

A native screen-reader attempt used an Aster-only temporary Chrome tab. Computer Use stopped before Narrator launch because it could not confidently determine the Windows browser URL. No screen-reader pass, spoken-output observation, software installation or permission bypass is claimed. Windows Narrator version 10.0.26100.8972 is present. Actual reader review, performance confirmation and clean acceptance remain required. No Phase 05 push, pull request or release has occurred.
