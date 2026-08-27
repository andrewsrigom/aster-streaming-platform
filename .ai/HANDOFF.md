# Handoff

## Resume point

P05-R01 is IN_PROGRESS on unpublished feat/p05-web-ssr, rebased onto released main b6c99c432603218d0a33c833e0b9a28b1c90e43b. P04-R02 is DONE.

## External transition

PR 21 is merged without bypass. Final exact-head run 33103379545 and post-merge run 33104100966 passed. Both review threads are resolved. See evidence/phase-04/release.txt. No external Phase 04 wait remains.

## Next outcome

Recovery checkpoint bb39f35 is committed. New responsive generic artwork passes 18 Web tests and all 14 functional browser journeys against image sha256:003475a0bede30bf1a161d408e3a6ba71cc6cf68e5e3a26c163a38f8868acf7a. The full browser run failed its fifteenth test on INP 256 ms. Later diagnostic runs also missed hydration/INP, including with tracing disabled. Latest attribution-based three-visit run passes, but stability is not resolved; raw samples and exact protocol are in evidence/phase-05/artwork-performance.json and its Markdown report. Do not rerun until green or claim tracing was the sole cause.

Continue bundle/HTML secret scans and accessibility; these do not depend on stable timing. For performance, inspect retained interaction attribution and establish environmental comparability before further experiments. The shared six-CPU host had one-minute load up to 6.72; no unrelated process was stopped. Keep existing 200 ms INP / 3500 ms hydration budgets and zero automatic GraphQL behavior. Preserve the explicit-request callback, safe projection and critical public content outside Suspense. No Phase 05 publication until complete acceptance.

## Local resources

The current artwork/laboratory source checkpoint passes 58/58 tasks (43 cached, 3m8.983s). Evidence/state prose was consolidated afterwards; no application source changed after the measured Docker image. No public remote mutation occurred.

Retained aster is untouched. aster-p04-development Router was restored on 4000, with existing private owners and the additive seed title 00000000-0000-4000-8000-000005000001. Its new Docker Web uses 3000; the old host Web process is stopped. For Web commands include base Compose, observability.yml and demo.yml with --profile observability; --no-deps can rebuild only Web. The aster-p05-demo-proof stack and all three owned synthetic volumes were removed after ownership/attachment validation; no proof resources remain. /tmp/aster-p04-clean-Hke28c remains the detached Phase 04 checkout. Never prune globally or remove retained data.

## Do not do yet

Do not publish Phase 05 before its complete acceptance. No player, actual-film rights approval, hosted identity or SLO claim. No private owner keys in Web; no direct SQL/Redis/owner calls from the frontend.
