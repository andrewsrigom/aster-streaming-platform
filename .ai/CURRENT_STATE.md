# Current State

Last updated: 2026-08-27

## Active phase

**Phase 03 — Catalog and Content Rights**

Status: **IN_PROGRESS**

## Verified

Phases 00–02 are released at main ec6386ca7add0f12ae748589be763d9e90ff0d6c (PR 19). [Release evidence](../evidence/phase-02/release.txt). Catalog P03-R05 is committed at 08a06ca: 91 tests and prior candidate gate pass; see [public query evidence](../evidence/phase-03/catalog-public.txt).

## Current work

P03-R04/R09 implementation is committed at 4e29f5eff7b5992abcd4911dcbec38aba1845e70 on feat/p03-catalog-rights. Read-only Catalog Docker runtime and generated HLS acceptance pass. 94 Catalog tests pass. Real Docker proves fresh/idempotent migrations, anonymous empty browse, reader isolation, privilege-loss detection, PostgreSQL outage/recovery and bounded SIGTERM shutdown. Real media generation produces six seconds at 320x180/24fps with audio and captions; repeated source/segment hashes match, corrupt/missing/symlinked segments and cancelled child processes are rejected. Real PostgreSQL proves the same Catalog application publishes and retires the generated reference, with derived attribution and two outbox facts. Two official-source candidate records remain NEEDS_CLARIFICATION and invisible; no films downloaded.

[Phase acceptance matrix](../evidence/phase-03/README.md), [Docker and clean-source checkpoint](../evidence/phase-03/catalog-runtime.txt), [media/application checkpoint](../evidence/phase-03/generated-media.txt). Candidate gate: 52/52 tasks, 29 cached, 25.796 s. Clean-source frozen offline install and full gate at 4e29f5e: 52/52, zero cached, 53.227 s. High-severity Node audit passes with one known moderate advisory. Author initial/confirmation review and local phase acceptance are complete. Protected CI, merge and post-merge verification remain pending; documentation-only closeout does not invalidate the implementation evidence.

## Not implemented

Router, web UI, real-film media worker/delivery/playback, engagement/discovery and hosted release. No playable VOD demo or approved film exists. The retained demo was not reseeded or reset.

## Next outcome

Close P03-R04/R09 by publishing one coherent Phase 03 candidate, requiring protected CI and resolved review threads, squash merging the verified head and confirming post-merge CI. Phase 04's independently testable schema prerequisite is verified; keep it inactive until predecessor release conditions pass.

## Current risks

- ADR-0016 keeps FFmpeg outside the request image and preserves MIT for Aster. Binary image distribution needs matching sources/notices; no image was pushed.
- Source reviews include cached official statements and failed direct retrieval. Exact asset permissions remain unresolved, blocking acquisition, not candidate-review completion.
- The fixture uses synthetic rights and non-deliverable HTTPS references. It proves media-byte validation and Catalog orchestration, not CDN or browser playback.
- Catalog HTTP receives only reader credentials. It cannot create operator authority or attestations; its PostgreSQL-only readiness also rejects excess privileges.
- A corrected readiness probe uses relation OIDs so inspecting privilege metadata does not require access to the private Identity schema.
- Expanded metadata decoder and durable audit/outbox must survive rollback. No broad prune/reset, changes to unrelated resources or bypass of protected gates.
