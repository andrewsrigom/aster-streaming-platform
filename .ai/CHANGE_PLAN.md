# Work Item: GraphQL Query Count and Owner Authorization Acceptance

- Status: IN_PROGRESS
- Owner: Platform and bounded-context owners
- Phase: 13
- Requirement IDs: P13-R07, P13-R08, P13-R09
- Created: 2026-08-31
- Updated: 2026-08-31

## Outcome

Every current public list and entity path has one explicit batching and
authorization review. Representative home, title, continue-watching and search
operations record real PostgreSQL query counts and observed latency. Owner tests
prove that substituted identifiers, cross-profile access and attempted role
escalation cannot disclose or mutate another owner's data. Passing this item
closes Phase 13 without changing the public schema.

## Current behavior

Item66 is released. Exact head `e6134ae` passed protected run `33447062908`,
both blocker discussions are resolved and final confirmation `5485910820`
found no major issue. PR56 squash main `98deb52` retained candidate tree
`897c44c`; exact-main run `33448911764` passed every required job.
PR57 initial review discussions `3899340521` and `3899340535` found that the
1/3/5/1 counts were owner-local and the audit accepted self-asserted owner,
scope and resolution labels. Corrected source `e0f5e27`, tree `da9b02b`, makes
the audit a composition invariant derived from the five owner schemas, exact
trusted operations/runtime policy and explicit implementation contracts.
Exact persisted documents through Router now measure TitleDetail2,
SearchTitles5, HomePublic7 and ContinueWatching7 across every participating
owner. Router26/26, query proof15/15, strict Engagement build and both full
disposable runtimes pass with cleanup0. The 12-case matrix remains unchanged.
Protected run `33456003304` then exposed a repeatable Docker restart boundary:
Discovery became healthy with the preserved generation, but the still-running
Router's first post-restart fetch used the stopped container endpoint and
returned `SUBREQUEST_HTTP_ERROR`. The recovery proof will therefore use a
finite end-to-end probe deadline, retry only that explicit transient fetch
classification, and fail immediately on any HTTP, GraphQL or generation
semantic mismatch.

## Proposed behavior

The source-owned audit beside Router composition exactly covers every
public list field and federated entity contribution. The audit records the owner,
request scope, batch maximum, source-query budget and authorization class, and
fails when the schema adds or removes an audited path.

Existing disposable Compose fixtures execute the exact current home, title,
continue-watching and search persisted documents through Router. An opt-in
pg_stat_statements overlay records restricted-role queries for every
participating owner. Fixed readiness statements and non-participating services
are isolated explicitly; ContinueWatching clears only disposable Catalog cache
keys to prove the cold batched path. Counts are bounded assertions, while
latency remains a single local observation rather than a production objective.
Current owner-side negative tests form one executable identifier/role/profile
matrix.

## Boundaries

- Owning context: each bounded context retains authorization and data ownership;
  Platform owns only the schema/path audit and combined evidence.
- Affected services/packages: Router composition tests; Catalog, Discovery,
  Engagement and Identity/Playback authorization tests and existing disposable
  PostgreSQL fixtures; Phase13 documentation/evidence.
- Authoritative data: each owner's PostgreSQL remains authoritative; the audit
  and report contain no product state.
- Read models/caches: Discovery projection and existing request-scoped
  DataLoaders are measured, not promoted to authority or cross-request caches.
- Trust boundaries: GraphQL IDs/arguments, entity representations, cookies,
  private-owner credentials and fixture output are untrusted.
- External dependencies: existing pinned Node, PostgreSQL, Router and Docker
  only; no GraphOS, hosted account, proxy or new dependency.

## Invariants

- DataLoader instances are created per request and never cross authorization
  scopes.
- Every list/entity path is bounded even when its source query count is constant.
- Query-count assertions use actual owner adapters, not invented counters after
  the persistence boundary.
- A GraphQL ID, entity representation or Router trust credential never grants
  account/profile/operator authority.
- Owner authorization occurs before disclosure or durable mutation and is
  rechecked where an existing use case requires freshness.
- Measurement cannot write outside its disposable fixture or claim a hosted SLO.

## Failure behavior

| Failure | Expected behavior | Telemetry/evidence |
| --- | --- | --- |
| New list/entity path lacks audit | Composition/test fails before publication | missing coordinate |
| Batch exceeds reviewed maximum | Owner rejects or splits within its fixed bound | finite path/batch fact |
| Cross-request loader reuse | Isolation regression fails | request IDs only in test memory |
| Identifier substitution | Owner returns not-found/unauthenticated/typed rejection; no write | matrix case/outcome |
| Cross-profile access | Engagement/Identity owner rejects without disclosing existence | matrix case/outcome |
| Role or private-credential escalation | Public/foreign caller cannot invoke operator/private path | matrix case/outcome |
| PostgreSQL fixture or measurement fails | No acceptance claim; exact fixture cleans up | command failure/remaining resources |
| Background readiness or non-participant traffic enters the count | Exclude only declared probe fingerprints, stop the named non-participant and retain the isolation event | per-owner count/isolation event |
| Discovery is healthy but Router still holds the stopped endpoint | Retry only `SUBREQUEST_HTTP_ERROR` inside one finite end-to-end recovery deadline; any other response fails immediately | attempt count, duration, preserved generation and cleanup |
| Predecessor PR changes | Rebase this dependent branch and repeat affected gates/evidence | exact base/head |

## Data and contracts

- Schema/migration: none.
- GraphQL: no field/type/nullability change; audit covers the released API.
- Events: none.
- Cache: no new cache; request-scoped DataLoader semantics remain unchanged.
- Compatibility: all 25 trusted operations remain byte-compatible.
- Retention/deletion: measurements use synthetic disposable rows and exact
  cleanup; no personal or retained media data.

## Security and privacy

- Authorization: Identity owns accounts/profiles, Engagement owns
  profile-scoped progress/watchlist, Playback owns title-bound sessions and
  Catalog's local operator remains outside public GraphQL.
- Input limits: existing ID, representation, pagination, request, cost,
  deadline, concurrency and rate limits remain.
- Sensitive data: evidence records only synthetic IDs as aggregate counts, path
  names, finite outcomes and timing; no cookies, keys, URLs or query values.
- Abuse cases: foreign profile/title/account substitution, entity-key
  substitution, forged forwarded identity, private credential misuse, operator
  escalation, loader cache bleed and list fan-out.

## Implementation steps

1. Inventory every current public list and entity path and encode an exact audit.
2. Add staleness, request-scope, batch-bound and authorization-class tests.
3. Measure real PostgreSQL counts/latency for exact home, title,
   continue-watching and search documents through Router and every participating
   owner.
4. Complete the owner authorization matrix with focused negative tests.
5. Run focused, disposable integration and affected candidate gates; capture raw
   evidence and close Phase13 documentation.
6. Publish item67 once from released item66 main and complete protected review,
   merge and exact-main gates.
7. If protected restart recovery returns the explicit transient subrequest
   classification, prove bounded end-to-end recovery without weakening logical
   response or generation assertions, then repeat only the affected heavyweight
   Discovery runtime and candidate gate.

## Tests

- Domain: existing owner identifier/profile policies; no new domain rule.
- Application: substituted account/profile/title, deleted/revoked owner and
  cross-profile behavior.
- Integration: exact persisted documents through Router, per-owner real
  PostgreSQL query counts/latency and no-write authorization checks in exact
  disposable fixtures.
- Contract: exact list/entity audit coverage, request-scoped loaders, batch
  maxima, current trusted-operation/schema compatibility.
- Browser: reuse the protected canonical sign-in/profile/browse/play journey;
  repeat locally only if Web/schema behavior changes.
- Performance/failure: four labelled single-fixture observations plus existing
  twenty-pair synthetic baseline versus one batched query; no throughput claim.

## Evidence

- Commands: focused owner/Router tests; Catalog, Discovery and Engagement real
  PostgreSQL fixtures; affected candidate gate; protected CI.
- Raw artifact path: `evidence/phase-13/query-count-authorization.txt` plus
  `evidence/phase-13/query-count-measurements.jsonl`.
- Acceptance result: corrected source `e0f5e27`, tree `da9b02b`, passes
  Router26/26, query proof15/15, strict Engagement build and both repeated exact
  federated runtime proofs with cleanup0. The corrected affected gate passes
  73/73 with36 cached in162.116 seconds. Publication, protected CI,
  confirmation, merge and exact-main gates remain.
- Iteration gate: Router/affected-owner builds and focused contract/security
  tests.
- Candidate gate: repository affected-scope gate selected from the exact diff.
- Heavyweight repeat triggers: repeat an owner PostgreSQL fixture only if its
  query path, adapter, migration, authorization policy or measurement changes;
  repeat packaged Router/browser only if schema/runtime/Web wiring changes.
- Review stopping rule: initial PR57 review is complete; this one batched
  remediation addresses both blockers. Run one confirmation and reopen only for
  a changed requirement, security/data, availability or public-contract blocker.

## Rollback or recovery

Revert the audit, fixture instrumentation and documentation as one item. No
schema, database, event, cache or media migration exists. If main changes before
publication, rebase, rerun affected contracts and only the heavyweight
measurements whose path changed.

## Documentation updates

- Phase13 evidence index and final acceptance report.
- GraphQL supergraph/security architecture and performance handbook.
- `.ai/` current state, queue, session log, handoff and decision ledger only if
  a decision changes.

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass at the dependent local-source checkpoint
- [x] Evidence captured for the dependent local-source checkpoint
- [x] Documentation current for the dependent local-source checkpoint
- [x] `.ai/` state updated
- [x] Remaining risks recorded
