# Work Item: Complete browser acknowledgement and immutable demo replay

- Status: IN_PROGRESS
- Owner: Web acceptance harness and Catalog local bootstrap; Engagement owns durable progress
- Phase: 08
- Requirement IDs: P08-R11
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

The browser journey observes durable save before navigation, and replay verifies existing immutable media without uploading it again.

## Current behavior

PR31 passed protected CI33217783905 and two clean reviews, then merged as e20a7de. Exact main33218775702 failed only in the personalized browser helper: Network.getResponseBody reported a body unavailable after navigation. The asynchronous waitForResponse predicate can read several bodies concurrently. All preceding source, SQL, Kafka and anonymous-browser stages passed; cleanup succeeded. This failed-test blocker is not WAITING_EXTERNAL.

The observer correction at 77eda41 passed both real browser journeys in PR32 run33220547568 and clean initial5458820383/confirmation5458880876 reviews. That run failed later in playable-seed replay: non-retryable streaming request and INITIALIZATION_REJECTED. The initializer conditionally uploads even existing objects before readback; a transport failure can prevent verification. The exact underlying SDK/provider failure is not proved. This reproduced bootstrap blocker remains IN_PROGRESS, not WAITING_EXTERNAL.

P09 domain work is preserved unpublished at 0e31767 on feat/p09-discovery-search, with Catalog snapshot WIP in stash770430dfd71f7a4eaa477f805f8bcc1c4082cc32. Rebase after predecessor repair and apply only that stash once. Retained demo remains Phase07.

## Proposed behavior

Select the intended request synchronously by endpoint, operation, title and sampled position. Consume and assert that single response outside the predicate before permitting navigation. Completion supplies the actual near-end media position. Never ignore response errors or weaken durable-save, history, resume or isolation assertions.

For each generated seed object, use the existing bounded storage HEAD. Existing objects require complete size/SHA256 readback and no PUT; only not_found permits one conditional PUT followed by the same verification. Keep If-None-Match for a competing creator between HEAD and PUT. Other lookup/write failures reject without retry. No data replacement, uncertain-success fallback or shared-adapter rewrite.

## Boundaries

Affected: apps/web/test, services/catalog/src/infrastructure/fixtures/playable-publisher.ts, its focused tests and the existing real media-origin fixture. Catalog owns media/approval; S3 responses and bytes are untrusted. ADR-0029/0026 retain immutable publication, private originals, rights checks and compensation. No owner, schema, migration, public API, dependency or storage-adapter contract change.

## Invariants

Read no unrelated browser body. Matching failed, malformed or wrong-position/status acknowledgements fail. Resolve only after its body is checked. Keep browser deadlines/zero retries and seed45-second/operation5-second budgets. Existing wrong, truncated, oversized or missing bytes reject; HEAD alone never proves integrity. Preserve content types/cache headers, children-before-master order, rights rechecks and publication barrier.

## Failure behavior

Missing response times out; body/ack failures propagate. Lookup unavailable/cancelled/timed-out does not mean missing. A creation race accepts only completed/already_exists followed by correct readback. Unknown PUT results fail closed. No pipeline retry, host restart or retained-data reset.

## Data and contracts

No changes. Tests use fictional metadata and existing GraphQL payloads; private traces stay uncommitted.

## Security and privacy

Do not record cookies, session data or media grants. Preserve production authorization/cost limits and retained runtime.

## Implementation steps

1. Extract synchronous response selection and awaited acknowledgement checks.
2. Prove unrelated-body isolation, body-before-resolution ordering and adverse acknowledgements deterministically.
3. Prove read-only replay, corruption refusal, cancellation and conditional creation races; extend the existing disposable real S3 fixture without encoding media.
4. Run the affected candidate gate; update the same PR32 with one coherent correction and refreshed boundary review.
5. Squash after green CI and confirmation; require exact main success before closing Phase08/resuming Phase09.

## Tests

Focused tests coordinate completion without sleeps. Add deterministic seed read-only replay, single-create/conflict, exact-byte mismatch, unavailable results and cancellation cases. The existing isolated media-origin test proves real SDK/S3 first creation, replay with zero further writes, hash rejection and immutable metadata. No film/FFmpeg/retained-stack run. Protected Docker-only acceptance must pass its browser journeys and final initialization replay without weakening assertions.

## Evidence

Iteration gate: focused seed/browser tests, scoped lint and Catalog/Web types. Candidate gate: canonical check:changed. Preserve earlier failure and focused output; record seed correction in evidence/phase-08/player-seed-replay.txt. Existing SQL/Kafka/player evidence remains supporting because their inputs do not change; this bootstrap change requires fresh real storage and protected full startup/replay. Do not repeat heavy evidence for unrelated prose. Previous browser reviews are clean; the new bootstrap availability boundary justifies a new review and confirmation, stopping after concrete blockers are resolved.

## Rollback or recovery

Revert the invalid correction while retaining the failed gate. Preserve Phase09 branch/stash, media, databases, keys, deletion fences and user applications. No database rollback or delete is needed.

## Documentation updates

Phase08 audit/release evidence, concise state/queue/session/handoff and demo replay procedure at the correction checkpoint. The read-before-create optimization preserves ADR-0029; no architecture change.

## Completion checklist

- [x] Regression and affected gates pass (11 focused tests; real storage;43/43 candidate)
- [ ] Protected browser acceptance and reviews pass
- [ ] Exact main succeeds and Phase08 closes
- [ ] Phase09 rebased and resumed without lost work
