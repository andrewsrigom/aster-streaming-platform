# Handoff

## Resume point

Continue IN_PROGRESS P04-R02 release on feat/p04-supergraph, based on released main 1354841. Source b5d7ab7 has complete local Phase 04 acceptance. Only evidence-only closeout and protected release remain; do not restart runtime implementation or repeat unaffected heavyweight checks.

## Current evidence

See evidence/phase-04/README.md, router-runtime.txt and clean-acceptance.txt. Complete clean-source gate: 55/55, 26 cached, 58.96 s. Fresh Docker build/start: 149.50 s with new data, warm base/install caches. Docker-only profile journey, ten public negatives, private owners, partial failure, admission and revocation pass. Earlier trace, SQL cancellation and shutdown evidence remains applicable. Two timing fixtures and a cold child-process envelope were corrected; runtime deadlines are unchanged. One moderate UUID advisory has a narrow reviewed disposition. No Phase 04 PR exists yet.

## Next outcome

Commit the evidence-only closeout, run its applicable candidate gate, then publish one protected Phase 04 PR. Require exact-head CI, resolved blocking review threads, squash and post-merge confirmation before Phase 05. Initial/confirmation author review is recorded in router-review.txt. The clean detached checkout /tmp/aster-p04-clean-Hke28c remains available at b5d7ab7; no running gate is left there.

## Local resources

The owned aster-p04-development stack uses new synthetic data, private subgraphs and Router loopback 4000. Retained aster Identity/status/PostgreSQL/Redis are unchanged. Diagnostic query-plan exposure was restored to false after trace capture. Development image IDs and source hashes are in the runtime evidence. Never run a global prune or reset retained data.

Fresh proof project aster-router-proof-0c7a2132-e984-45a4-9c59-85fc4d930a35 is removed: ten containers, three synthetic volumes, two networks; exact ownership and absence of foreign attachments were checked first. No retained data or image cache was deleted. Development Router is healthy again. Do not repeat or generalize that destructive cleanup to aster.

## Do not do yet

Phase 04 is not released. No UI, playable real film, hosted trust, SLO, advanced GraphQL protection or media rights approval exists. Compatible dependency licensing is authorized; preserve Aster MIT and upstream notices. Native GraphOS-key-protected limits remain disabled rather than bypassed.

## Predecessor

Phase 03 is released through PR 20: protected run 33090966906, squash 1354841 and post-merge run 33091716358 passed on attempt 1. evidence/phase-03/release.txt owns that record.
