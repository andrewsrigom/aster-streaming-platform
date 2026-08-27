# Handoff

## Resume point

Continue IN_PROGRESS P04-R02 release on feat/p04-supergraph, based on released main 1354841. PR 21 is open at 18f3c7e; its first protected run 33100857323 failed. Local remediation fixes the packaged Identity route and standalone Catalog diagnostic/cleanup compatibility. Do not restart runtime implementation or repeat unaffected heavyweight checks.

## Current evidence

See evidence/phase-04/README.md, router-runtime.txt and clean-acceptance.txt. Original clean-source gate: 55/55; fresh normal Docker startup/journeys pass. Publication head 18f3c7e also passed 55/55. Remediation passes CI policy 25/25, Catalog diagnostic/cleanup guards 3/3, the exact packaged Identity journey and fresh Catalog Docker proof (39550 ms, zero residual resources). Earlier Router trace, SQL cancellation, media and shutdown evidence remains applicable. One moderate UUID advisory has a narrow reviewed disposition.

## Next outcome

Commit the combined remediation, run pnpm check:changed in the clean detached checkout /tmp/aster-p04-clean-Hke28c at that new head, then push the same PR 21 once. Require exact-head CI, resolved blocking review threads, squash and post-merge confirmation before Phase 05. Author confirmation of the changed diagnostic/cleanup boundary is in router-review.txt. The detached checkout currently remains at 18f3c7e, with no running gate.

## Local resources

The owned aster-p04-development stack uses new synthetic data, private subgraphs and Router loopback 4000. Retained aster Identity/status/PostgreSQL/Redis are unchanged. Diagnostic query-plan exposure was restored to false after trace capture. Development image IDs and source hashes are in the runtime evidence. Never run a global prune or reset retained data.

Fresh proof project aster-router-proof-0c7a2132-e984-45a4-9c59-85fc4d930a35 is removed: ten containers, three synthetic volumes, two networks; exact ownership and absence of foreign attachments were checked first. No retained data or image cache was deleted. Development Router is healthy again. Do not repeat or generalize that destructive cleanup to aster.

## Do not do yet

Phase 04 is not released. No UI, playable real film, hosted trust, SLO, advanced GraphQL protection or media rights approval exists. Compatible dependency licensing is authorized; preserve Aster MIT and upstream notices. Native GraphOS-key-protected limits remain disabled rather than bypassed.

## Predecessor

Phase 03 is released through PR 20: protected run 33090966906, squash 1354841 and post-merge run 33091716358 passed on attempt 1. evidence/phase-03/release.txt owns that record.
