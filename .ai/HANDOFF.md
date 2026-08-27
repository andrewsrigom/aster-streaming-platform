# Handoff

## Resume point

P05-R01 is IN_PROGRESS on unpublished feat/p05-web-ssr, rebased onto released main b6c99c432603218d0a33c833e0b9a28b1c90e43b. P04-R02 is DONE.

## External transition

PR 21 is merged without bypass. Final exact-head run 33103379545 and post-merge run 33104100966 passed. Both review threads are resolved. See evidence/phase-04/release.txt. No external Phase 04 wait remains.

## Next outcome

Docker checkpoint befb432 is committed. Public recovery passes 58/58 source tasks, 17 Web tests and 11 browser journeys in 40.9 s; see evidence/phase-05/public-recovery.txt. Implement rights-safe responsive artwork, bundle/HTML scans and accessibility/performance next. Four routes render useful failure HTML without JavaScript; explicit retry and no automatic failed-preload request are verified. Preserve the consumer's transient explicit-request callback, safe error projection and critical public content outside Suspense. No Phase 05 publication until complete acceptance.

## Local resources

Retained aster is untouched. aster-p04-development Router was restored on 4000, with existing private owners and the additive seed title 00000000-0000-4000-8000-000005000001. Its new Docker Web uses 3000; the old host Web process is stopped. For Web commands include base Compose, observability.yml and demo.yml with --profile observability; --no-deps can rebuild only Web. The aster-p05-demo-proof stack and all three owned synthetic volumes were removed after ownership/attachment validation; no proof resources remain. /tmp/aster-p04-clean-Hke28c remains the detached Phase 04 checkout. Never prune globally or remove retained data.

## Do not do yet

Do not publish Phase 05 before its complete acceptance. No player, actual-film rights approval, hosted identity or SLO claim. No private owner keys in Web; no direct SQL/Redis/owner calls from the frontend.
