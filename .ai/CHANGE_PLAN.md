# Work Item: Complete durable browser acknowledgement without retained response bodies

- Status: IN_PROGRESS
- Owner: Web acceptance harness; Engagement owns durable progress
- Phase: 08
- Requirement IDs: P08-R11
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

The personalized browser journey proves durable progress, resume, completion, history, watchlist and profile isolation without depending on Chromium retaining a GraphQL response body across document changes.

## Current behavior

PR32 exact `dc571bd77e08529b8c91ccb53d44b0bf3bfdf089` passes105 Web tests, eight observer regressions, strict types, scoped lint and43/43 affected tasks locally. Protected run33225822813 passes dependency review, source quality, platform, Catalog, Playback, Engagement, immutable seed replay and service health. Its sole failure is the personalized browser: even though `response.json()` starts inside the selected response event, Chromium reports that the body was navigated away from at `apps/web/test/support/saved-progress.ts:47`.

This is a current acceptance-harness blocker, not WAITING_EXTERNAL. The previous deadline correction remains valid: no selected operation may wait beyond the shared12-second budget. The P09 domain, private Catalog and PostgreSQL persistence/search/rebuild checkpoints are committed locally on `feat/p09-discovery-search`; do not publish or modify them until this predecessor closes.

## Proposed behavior

Keep exact endpoint/method/operation/variables selection and the twelve-second deadline, but stop treating a browser-retained response body as the durable evidence. Use stable observable application/owner state to prove that the exact mutation completed before navigation. Preserve the failure case: transport abort must still show an unavailable/unconfirmed save while media continues. Do not weaken position, status, profile isolation, resume or completed-history assertions.

## Boundaries

Affected: `apps/web/test` and only the minimum production UI state if the existing accessible acknowledgement cannot distinguish the exact durable operation. Engagement remains the progress owner; GraphQL contracts, authorization, media, Catalog, storage and databases do not change. P09 stays preserved on its separate unpublished branch.

## Invariants

Match no unrelated GraphQL operation. A visible acknowledgement alone is insufficient if it can precede owner commit. Completion uses the actual near-end media position. Anonymous playback and transport-failure playback continue. No cookie, token, profile ID, signed URL or personal data enters logs/evidence.

## Failure behavior

Missing acknowledgement or owner state times out within12seconds. A failed, malformed, wrong-profile, wrong-title, wrong-position or wrong-status operation fails acceptance. No retry, pipeline replay, host restart, retained reset or assertion weakening.

## Data and contracts

No schema, migration, public GraphQL or event change is planned. Tests continue using fictional local profiles and the existing generated six-second title. If a narrow test-only observer contract is necessary, it must expose no production secret or owner authority.

## Security and privacy

Preserve server-side authorization and GraphQL limits. Never inspect or persist cookies/session assertions. Use the selected operation only as timing correlation and verify durable state through an authorized existing application path.

## Implementation steps

1. Reproduce the exact failure model deterministically and identify which browser observation remains stable across navigation.
2. Replace response-body dependence with exact request timing plus durable application/owner confirmation.
3. Add focused regressions for success, timeout, wrong operation and transport failure.
4. Run Web tests, types, scoped lint and the affected candidate gate once.
5. Push one correction to PR32, request one refreshed confirmation review, require protected acceptance, squash and exact main.
6. Rebase and resume the preserved P09 branch.

## Tests

Iteration: focused Web observer/browser-support tests and strict types. Candidate: canonical changed-scope gate. Protected: the existing Docker-only personalized journey and immutable replay. Do not repeat SQL, Kafka, storage or media experiments unless the correction changes those boundaries.

## Evidence

Record run33225822813's exact failure and the final focused correction under `evidence/phase-08/player-seed-replay.txt`. Keep earlier successful owner/replay stages as supporting evidence. One refreshed review and one confirmation are sufficient unless a new requirement, data, security, availability or public-contract blocker appears.

## Rollback or recovery

Revert only the acceptance-harness correction if it weakens or destabilizes the journey. Preserve the failed run, P09 commits, retained demo, media, databases, keys and deletion/version fences. No destructive recovery is required.

## Documentation updates

Update the Phase08 evidence, current state, queue, session and handoff at the corrected candidate and protected closeout. Do not claim Phase08 released before exact main succeeds.

## Completion checklist

- [ ] Focused correction proves durable acknowledgement without response-body retention
- [ ] Web and affected candidate gates pass
- [ ] Protected personalized browser and immutable replay pass
- [ ] Refreshed review is clean
- [ ] Squash and exact main succeed
- [ ] Preserved P09 is rebased and resumed

