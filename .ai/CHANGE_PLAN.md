# Work Item: GraphQL Query Count and Owner Authorization Acceptance

- Status: IN_PROGRESS
- Owner: Platform and bounded-context owners
- Phase: 13
- Requirement IDs: P13-R07, P13-R08, P13-R09
- Created: 2026-08-31
- Updated: 2026-09-01

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
returned `SUBREQUEST_HTTP_ERROR` in attempts 3 and 4. Source `c5ae760`, tree
`11b11c2`, now uses one 10-second end-to-end recovery deadline, retries only
that explicit transient fetch classification and fails immediately on any HTTP,
other GraphQL or generation semantic mismatch. The repeated local Discovery
runtime passed with the exact preserved generation, one recovery attempt in
129.793 ms and cleanup0. The final affected gate passes73/73 with64 cached in
52.555 seconds. Published evidence head `996798b` then entered protected run
`33460420680`: every job before Discovery passed, but the runtime showed that
Compose `up` had replaced the stopped service endpoint while the Router retained
the old direct Compose address for the entire 10-second probe. Source `c5b0eca`,
tree `5dadb0a`, then used `--no-recreate` to distinguish container identity from
its endpoint; its local runtime and 73/73 gate passed with both preserved.
Protected run `33462043470` made the cross-engine semantic explicit:
`--no-recreate` preserved the Discovery container identity, but Docker reassigned
its direct network address from `172.18.0.4` to `172.18.0.6`. A local Compose
service restart therefore requires a bounded Router process restart so its DNS
resolution observes the current endpoint. The proof will assert both container
identities, restart only the Router process after Discovery is healthy, and then
apply the unchanged finite generation/search probe. Phase14 must separately
prove replacement recovery through the selected hosted platform's stable service
address; this local harness must not claim that deployment behavior.
The first exact local execution of that coordinated restart reached a healthy
Router but its host-published port still returned `ECONNREFUSED` on the first
probe while Docker renewed the forwarding path. The same 10-second end-to-end
probe may retry only explicit local transport-startup codes (`ECONNREFUSED`,
`ECONNRESET`, `EPIPE` or the per-attempt `ABORT_ERR`) in addition to Router's
`SUBREQUEST_HTTP_ERROR`; all semantic mismatches still fail immediately.
That exact local execution then proved the Router container restart can also
reassign the proof overlay's ephemeral host port (`127.0.0.1::4000`). The
harness must resolve and validate the current loopback-only published port after
the controlled restart instead of probing the pre-restart port. Source
`02d6739`, tree `6d9e27b`, implements the complete coordinated local recovery.
The final runtime passed with Discovery/Router identities preserved, both direct
endpoint and host port changes observed, exact generation/search restored in one
attempt in269.302 ms and cleanup0. The final affected gate passes73/73 with61
cached in84.672 seconds. This changes no application endpoint or hosted contract.
Evidence head `7272f3f` passed protected run `33463962414`, and both initial
discussions are resolved. Confirmation discussion `3900443731` found that the
Engagement proof could rediscover a different two-row profile left by the earlier
deleted-profile scenario. Source `f5fbe29`, tree `4f44b71`, carries the exact
setup profile into measurement, consumes its control record without publishing
the synthetic ID, and removes arbitrary profile ordering. Focused proof3/3,
strict build, the complete Engagement runtime and the 73/73 affected gate pass;
the runtime records ContinueWatching7 in104.127 ms and cleanup0. Evidence head
`10bef1f` passed protected run `33465978576` attempt2 after attempt1's isolated
PostgreSQL transaction-timeout assertion passed on retry. Discussion
`3900443731` is resolved. Blocker-boundary confirmation discussion
`3900633355` then found that Catalog's audited one-query budget was lower than
its measured cold fence/load path and omitted the single fence-change retry.
Source `20b5f27`, tree `700bdc4`, exports Catalog's exact source-owned query
plan, derives a four-query worst-case budget, observes that sequence in an
executable fence-change test and consumes the same contract during Router
composition.
Catalog249/249, Router26/26 and the affected73/73 gate pass.
Published head `65e5dc2` entered protected run `33468676673`; documentation,
security and dependency review passed, while clean-checkout source quality found
that Router's top-level Catalog import was linted before Catalog declarations
were built. The correction exposes only the query-plan subpath with a checked-in
shape declaration included by Catalog's TypeScript project; runtime still loads
the compiled owner module, and the declaration duplicates no plan values. Final
source `1ec01c3`, tree `f27a9f8`, passes the complete clean-checkout source gate
63/63 with zero cached tasks in 159.682 seconds. The repeated affected gate
passes73/73 with63 cached in54.731 seconds. Protected run `33468676673` also
passed Local platform, so no unchanged heavyweight runtime is repeated before
the corrected publication. Final confirmation then found that the original
single-title Search and Home workload could not distinguish batching from one
query per entity. The first ten-title execution made that proof meaningful and
exposed a real contract violation: Catalog encoded four PostgreSQL parameters
per fence, so ten fences required 43 parameters and exceeded the shared
32-parameter transaction guard. Hydration failed closed with one attempted
Catalog statement and cleanup0; no acceptance was claimed from that run.
Catalog now sends the already validated, bounded fence tuples in one JSON
parameter and performs the same exact four-field match inside PostgreSQL. The
real Catalog integration resolves all 20 entities allowed by the request-scoped
DataLoader in one `findManyAtFences` statement. The complete repeated Discovery
runtime then hydrated ten distinct titles for both exact persisted documents at
unchanged totals: SearchTitles5 (Catalog2/Discovery3) in211.665 ms and
HomePublic7 (Catalog2/Discovery5) in149.035 ms. TitleDetail2, projection,
failure-isolation and restart-recovery checks also pass; cleanup reports zero
remaining resources. Published evidence head `71f3ff5` entered protected run
`33474006491`. Dependency, classification, documentation/security, clean source,
general integration, Catalog, Playback and Engagement passed. The Discovery
proof correctly retained query counts and responses, but rejected a legitimate
299-second projection freshness value because the harness required exactly300.
The owner contract permits a 300-second lease and at most two seconds between
source observation and projection indexing. The proof now accepts only the
derived inclusive 298–300-second interval and has focused acceptance/rejection
coverage. The repeated complete local runtime passes with freshness300, ten
distinct Search/Home titles, unchanged counts and cleanup0. The parallel Local
platform job failed only its known finite TraceQL indexing wait during the
PostgreSQL diagnostic scenario; it cleaned its exact project.

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
| Discovery process restart keeps identity but Compose reassigns its direct endpoint | Start with `--no-recreate`, assert Discovery identity, restart only the Router process to renew local DNS resolution, assert Router identity, then apply the finite semantic probe | identity preservation, endpoint-change fact, Router restart, attempt count, generation and cleanup |
| Router restart reassigns the proof's ephemeral host port or health precedes forwarding readiness | Resolve/validate the current loopback port after restart, then retry only the named local transport-startup codes inside the same 10-second end-to-end deadline | port-change fact, attempts, duration and final semantic response |
| Setup and an earlier scenario leave multiple two-row progress profiles | Carry the exact setup profile through a private runner control record; never rediscover it by row count/order | exact-profile assertion, ID excluded from evidence, repeated full runtime |
| Catalog fence changes between its cold fence and projection reads | Permit one exact `findFences`/`findManyAtFences` retry, derive the four-query maximum from the owner-exported plan and fail composition if the audit drifts | observed owner-call sequence and composition contract |
| Clean checkout lints Router before Catalog build output exists | Resolve the owner contract through its explicit typed subpath; keep runtime import on the compiled Catalog module | clean-worktree lint plus Router/Catalog builds |
| Query-count fixture hydrates only one distinct title | Seed ten disposable Catalog titles before the actual Discovery rebuild, execute the current Search and Home documents at their representative client sizes, require ten distinct hydrated entities and keep Catalog's observed count batch-bounded | exact multi-entity response assertions plus per-owner `pg_stat_statements` counts |
| Catalog encodes four SQL parameters per entity and exceeds the shared 32-parameter guard before the reviewed 20-title batch maximum | Encode the already validated, bounded fence tuples as one JSON parameter and preserve exact ID/version/rights/publication matching in PostgreSQL | real 20-entity Catalog integration plus exact ten-title Router measurements |
| Protected runtime spends one second between Catalog observation and Discovery indexing | Validate the derived inclusive 298–300-second lease window rather than an impossible exact300 timing assumption; keep values outside the owner contract rejected | focused boundary test plus repeated complete runtime |
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
   response or generation assertions. If Compose replaces the stopped endpoint,
   constrain the harness to the declared process-restart scenario and assert
   container preservation. If Docker reassigns that container's direct endpoint,
   restart only the Router process and record the local DNS-renewal boundary.
   Then repeat only the affected heavyweight Discovery runtime and candidate
   gate. Keep hosted stable-address replacement recovery in P14-R10.
8. Bind Catalog's contributor audit to its source-owned cold fence/load and
   single fence-change retry plan; prove the observed worst-case sequence and
   derive rather than duplicate the maximum owner-query budget.
9. Expose that contract through a narrow package subpath whose checked-in type
   shape is available before build output; prove lint from a clean worktree.
10. Seed ten rights-valid synthetic Catalog candidates in the disposable proof,
    let the existing Discovery rebuild project them, and measure the exact
    `SearchTitles(first: 20)` and `HomePublic(first: 10)` documents while
    asserting ten distinct hydrated titles at the unchanged batched owner count.
11. Repair the Catalog adapter boundary exposed by the representative workload:
    retain exact fence matching while keeping the reviewed 20-title batch below
    the shared PostgreSQL parameter guard, then prove the maximum batch against
    real PostgreSQL before repeating the federated runtime.

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
- Performance/failure: four labelled single-fixture observations, with Search
  and Home hydrating ten distinct Catalog entities at representative client
  sizes, plus the existing twenty-pair synthetic baseline versus one batched
  query; no throughput claim.

## Evidence

- Commands: focused owner/Router tests; Catalog, Discovery and Engagement real
  PostgreSQL fixtures; affected candidate gate; protected CI.
- Raw artifact path: `evidence/phase-13/query-count-authorization.txt` plus
  `evidence/phase-13/query-count-measurements.jsonl`.
- Acceptance result: federated source `e0f5e27`, tree `da9b02b`, passes
  Router26/26, query proof15/15, strict Engagement build and both repeated exact
  federated runtime proofs with cleanup0. Protected run `33456003304` attempts3
  and4 then repeated the post-restart Router endpoint failure. Recovery source
  `c5ae760`, tree `11b11c2`, passes the full Discovery runtime with the exact
  generation, one bounded recovery attempt in129.793 ms and cleanup0; its
  affected gate passes73/73. Exact-head run `33460420680` proved retries cannot
  heal a Compose replacement endpoint held by Router. Process-restart source
  `c5b0eca`, tree `5dadb0a`, preserves and asserts container identity/network
  endpoint. Its published evidence head `be6b57d` entered protected run
  `33462043470`; every earlier job and Local platform passed, while Discovery
  proved the same container can receive a new direct Compose endpoint. Final
  source `02d6739`, tree `6d9e27b`, coordinates the bounded Router DNS renewal,
  resolves the current ephemeral loopback port and keeps the semantic deadline.
  The full runtime passes with unchanged exact counts, both identities preserved,
  endpoint/port changes observed, exact generation/search, one recovery attempt
  in269.302 ms and cleanup0. Its final affected gate passes73/73 with61 cached in
  84.672 seconds. Evidence checkpoint publication, new protected CI,
  confirmation, merge and exact-main gates remained. Evidence head `7272f3f`
  passed protected run `33463962414`; both initial discussions are resolved.
  Confirmation discussion `3900443731` found nondeterministic profile
  rediscovery. Final correction source `f5fbe29`, tree `4f44b71`, carries the
  exact setup profile into measurement. Focused proof3/3, strict Engagement
  build, the complete runtime and corrected gate73/73 pass. The runtime records
  ContinueWatching7 in104.127 ms, cleanup0 and retainedRuntimeTouched false.
  Evidence head `10bef1f` passed protected run `33465978576` attempt2 and
  discussion `3900443731` is resolved. Confirmation discussion `3900633355`
  found the Catalog budget omitted its cold two-query path and one bounded
  fence-change retry. Source `20b5f27`, tree `700bdc4`, exports the exact owner
  query plan, derives the worst-case maximum as four and verifies the observed
  call sequence. Catalog249/249, Router26/26 and the affected73/73 gate with56
  cached pass in86.394 seconds. The query path, adapter, schema and measurement
  are unchanged, so the prior heavyweight Router observations remain applicable.
  Publication, protected CI, discussion resolution, final confirmation, merge
  and exact-main gates remain.
  Protected run `33468676673` then failed only clean-checkout lint because the
  top-level Catalog declaration did not yet exist when Router was analyzed. The
  subpath correction retains the same runtime plan while making its non-value
  type shape available before build. Final source
  `1ec01c320193e558661520db0303d4f37ecf76f4`, tree
  `f27a9f85fce67f5372685fe9a10e37672b7dae99`, passes a fresh detached
  clean-checkout `pnpm check:source` 63/63 with0 cached in159.682 seconds. The
  repeated affected candidate passes73/73 with63 cached in54.731 seconds.
  Final confirmation required a representative multi-entity workload. Its first
  run exposed the Catalog adapter's 43-parameter expansion for ten fences against
  the shared 32-parameter guard and correctly failed hydration with cleanup0.
  The bounded JSON-tuple correction preserves the exact four-field predicate.
  Catalog build, 249/249 unit tests and the real integration pass, including all
  20 entities allowed by the DataLoader and cleanup0. The complete Discovery
  runtime passes with ten distinct Search and Home hydrations at unchanged
  SearchTitles5 and HomePublic7 counts, plus the existing projection,
  failure-isolation, restart-recovery, log-safety and cleanup0 assertions.
  Source `3d90dff`, tree `331be6b`, is frozen. Its affected candidate gate
  passes73/73 with56 cached in69.532 seconds. Evidence checkpoint publication,
  protected CI, discussion resolution, permitted exact-candidate confirmation,
  merge and exact-main gates remain. Published evidence head `71f3ff5` then
  passed every source/owner job through Engagement, while Discovery exposed the
  exact300 freshness assertion after returning legitimate freshness299. The
  harness correction derives 298–300 from the existing 300-second lease and
  two-second indexing-lag bounds; focused proof5/5 and the complete repeated
  Discovery runtime pass with unchanged query counts, ten distinct entities,
  recovery and cleanup0. Protected run `33474006491` also had an independent
  known TraceQL indexing timeout in the PostgreSQL diagnostic scenario. Freeze
  the corrected source, rerun the affected gate, publish one checkpoint and
  repeat the two failed protected jobs through the normal exact-head workflow.
- Iteration gate: Router/affected-owner builds and focused contract/security
  tests.
- Candidate gate: repository affected-scope gate selected from the exact diff.
- Heavyweight repeat triggers: repeat an owner PostgreSQL fixture only if its
  query path, adapter, migration, authorization policy or measurement changes;
  repeat packaged Router/browser only if schema/runtime/Web wiring changes.
- Review stopping rule: initial PR57 review and the exact-profile confirmation
  are complete. Discussion `3900633355` changes the audited performance boundary,
  so one final blocker-boundary confirmation is required after this batched
  remediation. The resulting confirmation found that the one-title workload
  could not detect per-entity query amplification; this remediation changes that
  blocking P13-R07/P13-R08 proof boundary, so one confirmation of the exact
  multi-entity candidate is permitted. Reopen only for a requirement,
  security/data, availability or public-contract blocker.

## Rollback or recovery

Revert the typed query-plan contract source `1ec01c3`, Catalog owner-query-plan
source `20b5f27`, exact-profile source `f5fbe29`,
final coordinated-recovery source
`02d6739`, process-restart source
`c5b0eca`, initial recovery source `c5ae760`, federated source `e0f5e27`, the
audit, fixture instrumentation and documentation as one item. No schema,
database, event, cache or media migration exists. If main changes before
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
