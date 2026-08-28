# Work Item: Consume browser progress acknowledgement before navigation

- Status: IN_PROGRESS
- Owner: Web acceptance harness; Engagement retains durable progress ownership
- Phase: 08
- Requirement IDs: P08-R11
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

The browser journey observes the intended durable save before navigation, without concurrent response-body predicates racing document teardown.

## Current behavior

PR31 passed protected CI33217783905 and two clean reviews, then merged as e20a7de. Exact main33218775702 failed only in the personalized browser helper: Network.getResponseBody reported a body unavailable after navigation. The asynchronous waitForResponse predicate can read several bodies concurrently. All preceding source, SQL, Kafka and anonymous-browser stages passed; cleanup succeeded. This failed-test blocker is not WAITING_EXTERNAL.

P09 domain work is preserved, unpublished, as c9cb96d on feat/p09-discovery-search. Correct Phase08 on fix/p08-browser-ack, then rebase the dependent and repeat affected gates. Retained demo remains Phase07.

## Proposed behavior

Select the intended request synchronously by endpoint, operation, title and sampled position. Consume and assert that single response outside the predicate before permitting navigation. Completion supplies the actual near-end media position. Never ignore response errors or weaken durable-save, history, resume or isolation assertions.

## Boundaries

Only apps/web/test browser support and focused node tests change. No application runtime, owner, schema, migration, public contract or dependency changes. Browser network events and bodies are the scheduling boundary.

## Invariants

Read no unrelated body. Matching failed, malformed or wrong-position/status acknowledgements fail. Resolve only after the matching body is read and checked. Existing finite browser deadlines and zero retries remain unchanged.

## Failure behavior

Missing response times out; body-read and acknowledgement failures propagate. No navigation follows a falsely successful observation. No pipeline retry, host restart or retained-data reset.

## Data and contracts

No changes. Tests use fictional metadata and existing GraphQL payloads; private traces stay uncommitted.

## Security and privacy

Do not record cookies, session data or media grants. Preserve production authorization/cost limits and retained runtime.

## Implementation steps

1. Extract synchronous response selection and awaited acknowledgement checks.
2. Prove unrelated-body isolation, body-before-resolution ordering and adverse acknowledgements deterministically.
3. Run the affected candidate gate; publish one correction for protected real-browser acceptance and normal review.
4. Squash after green CI and confirmation; require exact main success before closing Phase08/resuming Phase09.

## Tests

Focused node tests coordinate body completion with a promise, not sleeps. Existing player/reporting tests remain applicable. Protected Docker-only browser acceptance must pass without weakening assertions. No local full-stack repetition for this harness-only correction; CI exercises the changed real-browser boundary.

## Evidence

Iteration gate: focused node tests, scoped lint and Web types. Candidate gate: canonical check:changed. Preserve main failure and focused output in evidence/phase-08/player-browser-ack.txt. Existing runtime/SQL/Kafka/media evidence remains applicable because runtime inputs do not change. Repeat heavyweight evidence only for affected behavior, bootstrap or packaging changes. One initial and one confirmation review; extend only for concrete requirement, security/data, availability or public-contract blockers.

## Rollback or recovery

Revert only the invalid harness correction; retain the failing gate rather than claiming release. Preserve Phase09 branch, media, database, keys, deletion fences and user applications.

## Documentation updates

Phase08 audit/release evidence plus concise state, queue, session and handoff at the correction checkpoint. No ADR for test-only scheduling.

## Completion checklist

- [ ] Regression and affected gates pass
- [ ] Protected browser acceptance and reviews pass
- [ ] Exact main succeeds and Phase08 closes
- [ ] Phase09 rebased and resumed without lost work
