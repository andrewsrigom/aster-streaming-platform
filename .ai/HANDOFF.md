# Handoff

## Resume point

Continue IN_PROGRESS P04-R02 on feat/p04-supergraph, based on released main 1354841. Schema delivery is locally verified; the runtime candidate now implements Router 2.17.0, private Identity/Catalog, per-owner file credentials, owner-validated sessions and bounded telemetry. Do not restart implementation from the historical schema-only handoff.

## Current evidence

See evidence/phase-04/README.md and router-runtime.txt. Docker-only sign-in/profile/sign-out, ten public-negative cases, private ports, wrong-owner key rejection, nullable partial timeout, 12-call admission, revocation, real SQL-wait cancellation, Collector outage, natural Router stop and health recovery pass. Query-plan and actual Collector export are stored. Candidate gate passed 55/55 tasks, 24 cached, 56.14 s; final evidence/confirmation changes still need their gate. No Phase 04 PR exists yet.

## Next outcome

Author review and confirmation are recorded in evidence/phase-04/router-review.txt. Commit the coherent candidate, run clean-source full acceptance plus fresh Docker startup/journey, then publish one protected Phase 04 PR. Require exact-head CI, squash and post-merge confirmation before Phase 05. No repeated media/broker experiment is needed for prose-only closeout; runtime changes repeat their affected probes.

## Local resources

The owned aster-p04-development stack uses new synthetic data, private subgraphs and Router loopback 4000. Retained aster Identity/status/PostgreSQL/Redis are unchanged. Diagnostic query-plan exposure was restored to false after trace capture. Development image IDs and source hashes are in the runtime evidence. Never run a global prune or reset retained data.

A new proof project must use an exact UUID name and new owned volumes. Stop only the development Router to free port 4000, then restore it after proof cleanup. Validate exact project/service/volume ownership and foreign attachments before cleanup; the fixed aster reset is not a proof-project cleanup tool.

## Do not do yet

Phase 04 is not released. No UI, playable real film, hosted trust, SLO, advanced GraphQL protection or media rights approval exists. Compatible dependency licensing is authorized; preserve Aster MIT and upstream notices. Native GraphOS-key-protected limits remain disabled rather than bypassed.

## Predecessor

Phase 03 is released through PR 20: protected run 33090966906, squash 1354841 and post-merge run 33091716358 passed on attempt 1. evidence/phase-03/release.txt owns that record.
