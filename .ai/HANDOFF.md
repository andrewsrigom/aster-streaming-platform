# Handoff

## Resume point

P05-R01 is IN_PROGRESS on unpublished feat/p05-web-ssr, based on released main b6c99c4. Application checkpoint e130e8e fixes refresh ownership. Phases 00–04 are released; no external Phase 04 wait remains.

## Verified checkpoint

Clean source 56a1320 passed an uncached 58/58 gate in 132.078 s after fixing the Express diagnostic test wrapper (15 s subprocess allowance; its 2 s HTTP deadline and 1 s drain are unchanged). Clean Docker-only startup, seed, runtime isolation and actual context canaries pass.

Browser acceptance exposed a real callback-owner bug, not a network timeout: after a shared-query route change the old image sent zero requests on explicit refresh. Apollo compares callback source text, so a stable non-serialized per-consumer Symbol now distinguishes closure owners. Final source e130e8e passes 19/19 browser scenarios in 74.076 s and 58/58 source tasks in 48.789 s (43 cached). Fourteen axe scans and public/authenticated artifact isolation pass. See evidence/phase-05/clean-acceptance.md and clean-browser.jsonl for before/after results, scope and limitations.

## Next action

Confirm the final image's three-visit performance workload under the recorded quiet-host conditions, then complete actual screen-reader review and protected publication. Earlier six visits passed on the prior image, but the later CSS/context correction and callback fix require final-image confirmation. At 19:55 the preflight found load 4.67 and other active headless browsers, so no measurement started. Do not stop unrelated builds or select only passing samples.

Actual screen-reader review remains required. Existing Windows Narrator is available; the previous control attempt stopped before launch because it could not establish the browser URL. Follow the supported target-selection/activation workflow and do not bypass a policy stop. A DOM/accessibility tree or axe report is not speech evidence.

Preserve the explicit-request guard, per-consumer identity, public positive projection, useful non-Suspense SSR, four-second transport deadline, 200 ms INP and 3500 ms hydration budgets.

## Runtime and retained data

The proof project aster-p05-clean-proof was fully removed after checking its labels and all volume attachments: no containers, networks or volumes remain. Only its three disposable volumes were deleted. The clean detached checkout /tmp/aster-p05-clean-pDkoZQ remains at e130e8e with installed verification dependencies.

Development Web/Router are restored and healthy on 3000/4000. Web image sha256:1a1a10c44282573f33538b9e4c297e964f3450a7203d2e6845c8b6b54ef400f8 has the same eleven filesystem layers as accepted proof image sha256:f295e856d810619a3a6d4011d07ad99d2d8025aec184078b9f0bd1f86ac3e6f9. Router image remains sha256:76b37d0452e418ffe2c5f05d4e58dda9986bc2b84d0fadf55ae731c043604561.

Use base Compose plus observability.yml and demo.yml with --profile observability for this development project. Browser tests use ASTER_ROUTER_CONTAINER=aster-p04-development-router-1 and ASTER_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome. Retained aster, old development owner data and both PostgreSQL volumes are untouched. Never prune globally.

## Logs and publication

Local logs: /tmp/aster-p05-clean-source-gate.log (initial failure), /tmp/aster-p05-clean-source-confirmation.log (uncached pass), /tmp/aster-p05-clean-start.log, /tmp/aster-p05-clean-browser.log (17/18), /tmp/aster-p05-refresh-remount-before.log (red regression), /tmp/aster-p05-refresh-build.log, /tmp/aster-p05-clean-browser-confirmation.log (19/19), /tmp/aster-p05-refresh-source-gate.log, /tmp/aster-p05-clean-cleanup.log and /tmp/aster-p05-development-restore.log. Exported public evidence excludes private cookies and raw trace payloads.

## Do not do yet

Do not publish Phase 05 until acceptance is complete. No player, playable demo, acquired-film approval or hosted identity/SLO is claimed. Phase 06 must begin with an actual complete rights review before acquisition; the synthetic seed is not a substitute for those prerequisites.
