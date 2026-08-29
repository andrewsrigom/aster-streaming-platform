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

The read-only seed correction at ea4c72f passed source quality, real platform, Catalog generation, Playback and Engagement integration, including immutable seed reuse. Protected run33222164370 then reproduced the browser failure in the first personalized progress acknowledgement: `response.json()` began only after `waitForResponse` resolved, and Chromium had already discarded the resource body. Source job99018340341 otherwise passed through the complete bootstrap; cleanup succeeded. This is the active blocker.

The event-turn progress correction at d2ba88f passed its exact-head confirmation review without findings. Protected run33223692248 passed source, platform, Catalog, Playback, Engagement, immutable replay and service health, then failed before profile creation because the separate initial `Profiles` response body was also read only after UI work. Chromium reported the same discarded-resource error at engagement.spec.ts:47. The active correction centralizes exact GraphQL response selection and starts both profile and progress body reads inside their response event.

Review5056138342 on exact6c78d2a found one P1 deadline regression: selection removed the listener and cleared the timer before `response.json()` settled, so a stalled selected body could defer failure to Playwright's90-second test timeout. The correction keeps the original timer active through body success/failure; the same deadline now covers selection and consumption.

P09 domain/Catalog snapshot work is preserved unpublished through c52b259 on feat/p09-discovery-search. Its complete private transport/runtime WIP is in stash 01b1dad9bbda289976d137b1a20af9f7cf102add; apply only that newest stash after predecessor repair and never reapply the historical stashes. Retained demo remains Phase07.

## Proposed behavior

Select each intended GraphQL request synchronously by endpoint, method and exact request predicate. Start consuming the selected body in the same `response` event turn, remove the listener, and keep the original12-second deadline active until the body succeeds or fails. The progress specialization additionally checks title, sampled position and the durable acknowledgement; the profile bootstrap rejects a retained collection before creating anything. Completion supplies the actual near-end media position. Never ignore response errors or weaken durable-save, history, resume or isolation assertions.

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

1. Extract synchronous response selection and event-turn acknowledgement capture.
2. Prove unrelated-body isolation, body-start-before-event-return, body-before-resolution ordering and adverse acknowledgements deterministically.
3. Prove read-only replay, corruption refusal, cancellation and conditional creation races; extend the existing disposable real S3 fixture without encoding media.
4. Run the affected candidate gate; update the same PR32 with one coherent correction and refreshed boundary review.
5. Squash after green CI and confirmation; require exact main success before closing Phase08/resuming Phase09.

## Tests

Focused tests coordinate completion without arbitrary sleeps. Eight browser observer regressions include progress/profile body capture during the response event and a selected body that never settles before the shared deadline; the full Web suite passes105 tests with strict types and scoped lint. Deterministic seed tests cover read-only replay, single-create/conflict, exact-byte mismatch, unavailable results and cancellation. The existing isolated media-origin test proves real SDK/S3 first creation, replay with zero further writes, hash rejection and immutable metadata. No film/FFmpeg/retained-stack run. Protected Docker-only acceptance must pass its browser journeys and final initialization replay without weakening assertions.

## Evidence

Iteration gate: focused seed/browser tests, scoped lint and Catalog/Web types. Candidate gate: canonical check:changed. Preserve earlier failure and focused output; record seed correction in evidence/phase-08/player-seed-replay.txt. Existing SQL/Kafka/player evidence remains supporting because their inputs do not change; this bootstrap change requires fresh real storage and protected full startup/replay. Do not repeat heavy evidence for unrelated prose. Previous browser reviews are clean; the new bootstrap availability boundary justifies a new review and confirmation, stopping after concrete blockers are resolved.

## Rollback or recovery

Revert the invalid correction while retaining the failed gate. Preserve Phase09 branch/stash, media, databases, keys, deletion fences and user applications. No database rollback or delete is needed.

## Documentation updates

Phase08 audit/release evidence, concise state/queue/session/handoff and demo replay procedure at the correction checkpoint. The read-before-create optimization preserves ADR-0029; no architecture change.

## Completion checklist

- [x] Updated regression and affected gates pass (Web105/105, eight observer cases, types, scoped lint and43/43 candidate)
- [ ] Protected browser acceptance and reviews pass
- [ ] Exact main succeeds and Phase08 closes
- [ ] Phase09 rebased and resumed without lost work
