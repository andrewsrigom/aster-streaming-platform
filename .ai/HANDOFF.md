# Handoff

## Resume point

P05-R01 is IN_PROGRESS on unpublished feat/p05-web-ssr, rebased onto released main b6c99c432603218d0a33c833e0b9a28b1c90e43b. P04-R02 is DONE.

## External transition

PR 21 is merged without bypass. Final exact-head run 33103379545 and post-merge run 33104100966 passed. Both review threads are resolved. See evidence/phase-04/release.txt. No external Phase 04 wait remains.

## Next outcome

Continue P05-R01 using .ai/CHANGE_PLAN.md. Public home/browse/localized title/attribution, filtered Apollo hydration, finite normalized cache retention and explicit idempotent seed are implemented. Eight Web tests, 98 Catalog tests and four browser journeys pass. The initial no-JavaScript failure was fixed by removing critical-content Suspense; refined first test also proves exactly one Router Browse operation. See evidence/phase-05/public-runtime.txt. Source gate passes 58/58 tasks; frozen install and high-threshold audit pass. Next add profile/dialog/Redux shell with narrow Web-origin trust, artwork, adverse states, performance and Docker acceptance.

## Local resources

Retained aster and aster-p04-development remain available. Development Router uses loopback 4000 with private owners and now contains only the additive seed title 00000000-0000-4000-8000-000005000001. Web production process uses loopback 3000. No proof stack is left from Phase 04/Catalog acceptance. /tmp/aster-p04-clean-Hke28c is the clean detached Phase 04 checkout at 66d8ee1; its gate is complete. Never prune globally or remove retained data.

## Do not do yet

Do not publish Phase 05 before its complete acceptance. No player, actual-film rights approval, hosted identity or SLO claim. No private owner keys in Web; no direct SQL/Redis/owner calls from the frontend.
