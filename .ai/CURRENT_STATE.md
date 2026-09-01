# Current State

Last updated: 2026-09-01

## Active phase

**Phase 14 — Reference Quality, Capacity Validation, and Hosted Release**

Status: **IN_PROGRESS**. Phases00–13 are released. The credential-free
reference-quality track P14-R13–R18 is active under ADR-0048. Hosted capacity
and release requirements P14-R01–R12 remain planned and inactive until the
repository owner explicitly authorizes provider choices, credentials and
resource creation.

The sole active work item is item68 on branch
`docs/reference-first-roadmap`, worktree `/tmp/aster-reference-roadmap`,
from exact released main `83cb5100408a691da15550194af6763c55170ba7`.
It records the Phase13 release and establishes the reference-first runway
without changing executable behavior.

## Verified

Phases00–12 retain their linked acceptance and exact-main evidence. Phase13 is
released:

- final correction source `a99b3af5212e4fb967ed41230c3ca59fa394cca7`,
  tree `dc84bbc4cf63b0e8ce977a8f90fbb296f9f6903e`;
- evidence checkpoint `71823fe18d11832183e6af8acdab2210e7486af4`
  passed protected run `33485233911`;
- result checkpoint `db17bca9154984642d9b11d00d06c5ebd6d31b80`,
  tree `41650b4d0ee4244084e0d0d34d8aa387cda52cc3`, passed protected run
  `33486901296`;
- the final corrected-candidate review completed without a new finding and all
  six PR57 review threads are resolved;
- PR57 squash main `83cb5100408a691da15550194af6763c55170ba7`
  retained candidate tree
  `41650b4d0ee4244084e0d0d34d8aa387cda52cc3`;
- exact-main run `33489232182` passed source quality, every owner runtime,
  the Docker-only playable demo, all three local diagnostic scenarios, exact
  cleanup and the aggregate gate.

[Phase13 release evidence](../evidence/phase-13/release.md) is authoritative
for the final source, runs, review, merge and limitations. No hosted deployment
is claimed.

## Current work

Item68 implements P14-R13 as a documentation and delivery-governance slice:

- ADR-0048 separates the active reference track from the deferred hosted track;
- the Phase14 specification adds P14-R13–R18 without renumbering or weakening
  hosted P14-R01–R12;
- public roadmap, start-here documents and repository memory identify local
  reproducibility and navigability as the immediate outcome;
- Phase13 release evidence closes the former active item truthfully;
- repository-memory, documentation, formatting and changed-scope gates must
  pass before publication.

No GraphQL schema, service behavior, database, cache, event, media or runtime
configuration changes in item68.

Source `bd1191d0fb09f623c442ce6cee598cff2375b0d0`, tree
`80337eb7bc06f5c10fd86d30044ab9a77cdbb6a5`, passes repository-memory,
documentation, formatting, JSONL and changed-scope gates. The selected gate
passes9/9 tasks, including101 platform-policy and13 repository-memory tests.
[Phase14 evidence](../evidence/phase-14/README.md) records the exact local
candidate result. Evidence head `6bbb3da` passed protected run
`33492326127`. Initial review discussion `3902757945` found that the handoff
could request a duplicate evidence commit. Correction `7976c17`, tree
`0af69fe`, starts from the committed checkpoint and passes the repeated local
gate. Corrected protected acceptance remains pending.

## Ordered reference-quality runway

Only one item may be active at a time:

1. item68 — record the Phase13 release and reference-first runway (P14-R13);
2. item69 — publish a capability-to-code/test/evidence/operations index
   (P14-R14);
3. item70 — define readability guardrails and inventory concrete findings
   (P14-R15);
4. items71–73 — refactor representative owner-scoped slices with
   characterization evidence (P14-R16);
5. item74 — add rationale comments, examples and bounded reading paths
   (P14-R17);
6. item75 — run fresh-checkout and Docker-based reference acceptance and
   verify the reference track (P14-R18).

The detailed queue and activation conditions live in
[WORK_QUEUE.md](WORK_QUEUE.md).

## Verified local capabilities

The released baseline includes:

- guarded identity sessions and profile ownership;
- rights-aware Catalog ingestion and publication;
- federated GraphQL through Apollo Router with trusted-operation and bounded
  demand controls;
- public SSR discovery, title detail and accessible HLS playback;
- durable progress, resume and owned library behavior;
- versioned owner events, idempotent recovery and explicit Redis degradation;
- search and home discovery with measured query budgets;
- structured telemetry, executable SLIs/SLOs, alerts, dashboards and three
  telemetry-led failure diagnoses;
- Docker-only playable demonstration and exact fixture cleanup.

These are local/repository release claims backed by phase evidence, not claims
of public availability, production capacity or licensed commercial catalog.

## Not implemented

- P14-R14 capability index;
- P14-R15 readability standard and repository inventory;
- P14-R16 representative readability refactors;
- P14-R17 reading guides and focused examples;
- P14-R18 fresh-reference acceptance and reference-track verification;
- every hosted P14-R01–R12 outcome, including provider selection, production
  credentials, representative hosted load, backups/restores, edge controls,
  public endpoints, deployment rollback and production operations.

## Runtime and recovery

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Integration fixtures use exact
project labels, loopback-only ports, tmpfs PostgreSQL and cleanup
`remaining=0`. Preserve retained databases, media and unrelated Docker
projects. Never use a branch beginning with `codex/`.

Heavy PostgreSQL, browser, media, owner-runtime or platform evidence remains
valid until an executable change can affect it. Documentation-only work runs
the repository-memory, link, formatting and changed-scope gates.

## Current risks

- Reference-track status can be confused with a hosted release; every claim
  must name the track.
- Readability can become subjective or behavior-changing; findings must cite a
  concrete reading problem and refactors require characterization tests.
- Broad cleanup can obscure ownership and invalidate evidence; changes stay
  small, context-owned and reversible.
- Examples can accidentally weaken security or licensing rules; they use
  synthetic identities, reviewed fixtures and the same trust boundaries as the
  implementation.
- Hosted work requires explicit owner activation and cannot create paid
  resources, credentials, public endpoints or media-rights claims autonomously.

## Next outcome

Complete item68 (P14-R13) candidate gates, review, merge and exact-main
acceptance.
Then start item69 from clean released main and build the capability index before
renaming or reorganizing implementation code.
