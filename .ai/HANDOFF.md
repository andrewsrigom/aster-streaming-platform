# Handoff

## Resume point

P05-R01 is IN_PROGRESS on feat/p05-web-ssr in PR 22. Phases 00–04 are released; main is b6c99c4. Initial head abf3a84 passed hosted functional gates but failed dependency licensing. The batched remediation is documented in evidence/phase-05/pr22-remediation.md and pr22-remediation.json.

## Current acceptance

Final source gate: 58/58, 39 cached, 55.482 s. Final-image functional run: 20/21; the first artifact-scan GET had a socket reset. Its complete focused confirmation passes 1/1. Web shows zero restart/OOM/server error. All 21 distinct scenarios, including both review regressions and preserved button alignment, have passing current evidence.

Three final mobile visits pass unchanged budgets: initial JavaScript 232506 bytes (8426 fewer), cumulative 250806, hydration 3019.2/3490.5/3058.5 ms, LCP 1532–1608, INP 112–184, CLS 0. Additional confirmation was deferred at 01:14:28Z: WSL load 4.52 and live idle 56/53%. The Windows host is shared with owner programs. Do not insist on 100% idle, stop their programs/security controls or select passing results through repeated runs.

## Runtime and retained data

Development Web/Router remain on 3000/4000 in project aster-p04-development. Web image: sha256:25d53997edea8dca8afe246324bfa1eab06eb412131a4178b1308b8e60a5ef90. All 14 traced runtime packages map to 73 notice entries/205 checked artifact hashes.

Compose uses compose.yml, observability.yml and demo.yml with --profile observability. Browser commands use ASTER_ROUTER_CONTAINER=aster-p04-development-router-1 and ASTER_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome. No overlapping build/browser/performance suites.

Only the labeled mount-free aster-p05-pr22-before diagnostic container was removed; image/raw records remain. Retained aster/development databases, earlier reader archives and clean checkout are preserved.

## Next action

Publish the coherent candidate once, update/reply to both PR findings and request one confirmation review. Complete remaining final confirmation when its existing preconditions allow, protected exact-head CI, squash merge without bypass and post-merge check. Do not mark WAITING_EXTERNAL while local acceptance remains. Reuse unchanged clean seed/isolation and actual-reader mechanisms; prose-only closeout needs documentation/state/secret checks, not another Docker/browser experiment.

## Do not do yet

Phase 06 first requires actual-film rights approval before acquisition and current FFmpeg/object-storage checks. The synthetic seed is not film approval or playable delivery. Keep the full Phase 00–14 goal active.
