# Handoff

## Resume point

P05-R01 is IN_PROGRESS on feat/p05-web-ssr in PR 22. Phases 00–04 are released; main is b6c99c4. Code candidate e4708c4c32ef09d901dd040f9ed87e92426e9406 passes protected CI 33132459201 (all six jobs) and confirmation review 5447217847 reports no major issues. Initial review threads are resolved. The batched remediation is documented in evidence/phase-05/pr22-remediation.md and pr22-remediation.json.

## Current acceptance

Final source gate: 58/58, 39 cached, 55.482 s. Final-image functional run: 20/21; the first artifact-scan GET had a socket reset. Its complete focused confirmation passes 1/1. Web shows zero restart/OOM/server error. All 21 distinct scenarios, including both review regressions and preserved button alignment, have passing current evidence.

Both independently invoked final mobile blocks pass unchanged budgets: initial JavaScript 232506 bytes (8426 fewer), cumulative 250806; hydration 3019.2/3490.5/3058.5 then 2949.7/2727.6/2976.6 ms. Across six visits LCP is 1520–1608, INP 88–184 and CLS 0. Final confirmation at 01:22:18Z met the existing preconditions, after the earlier deferred preflight. Raw second-block evidence: evidence/phase-05/performance-final-confirmation.json. The shared Windows host was not modified. No additional unchanged benchmark is required.

## Runtime and retained data

Development Web/Router remain on 3000/4000 in project aster-p04-development. Web image: sha256:25d53997edea8dca8afe246324bfa1eab06eb412131a4178b1308b8e60a5ef90. All 14 traced runtime packages map to 73 notice entries/205 checked artifact hashes.

Compose uses compose.yml, observability.yml and demo.yml with --profile observability. Browser commands use ASTER_ROUTER_CONTAINER=aster-p04-development-router-1 and ASTER_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome. No overlapping build/browser/performance suites.

Only the labeled mount-free aster-p05-pr22-before diagnostic container was removed; image/raw records remain. Retained aster/development databases, earlier reader archives and clean checkout are preserved.

## Next action

Publish the evidence-only closeout, wait for its exact-head protected CI, squash merge without bypass and verify post-merge. The code confirmation is complete; do not request another review or repeat unchanged Docker/browser/reader experiments for prose-only evidence. Only start Phase 06 after ordered release, or on an explicitly frozen WAITING_EXTERNAL predecessor under the repository contract.

## Do not do yet

Phase 06 first requires actual-film rights approval before acquisition and current FFmpeg/object-storage checks. The synthetic seed is not film approval or playable delivery. Keep the full Phase 00–14 goal active.
