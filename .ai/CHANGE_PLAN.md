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

Item66 is frozen on PR56 at second corrected exact head `1e115fe`, based on
released item65 main `8cd6c0b`. Its second corrected source `bf14e2c`, tree
`0084c67`, passes the affected gate57/57, all11 real integration scenarios and
the exact-source removed-marker replay proof; protected CI run `33442875698`
and blocker-focused confirmation remain external.
Existing owners already use bounded request-scoped DataLoader for Catalog Title
entities and Engagement Title/Profile fields. Phase08 evidence records one
twenty-pair Engagement before/after comparison, and owner tests cover many
authorization failures separately. Phase13 does not yet have one complete,
staleness-checked path inventory, four-operation query-count report or
consolidated authorization matrix.

Protected run `33442875698` passes exact head `1e115fe`. The blocker-focused
confirmation found two remaining acceptance gaps: the packaged runtime verifier
hard-codes 25 demand profiles instead of accepting the bounded current-plus-
retained trusted union, and healthy Redis admissions do not prune expired local
failover markers before enforcing their 8,192-entry capacity. Both are blocking
rollout/availability boundaries and are remediated together before release.

## Proposed behavior

Add a source-owned audit beside Router composition that exactly covers every
public list field and federated entity contribution. The audit records the owner,
request scope, batch maximum, source-query budget and authorization class, and
fails when the schema adds or removes an audited path.

Extend existing disposable PostgreSQL fixtures to measure the actual home,
title, continue-watching and search application paths without a new service or
benchmark harness. Record query count and elapsed time after fixture warmup;
assert bounded counts, but treat latency as a single local observation rather
than a production objective. Consolidate current and new owner-side negative
tests into an executable identifier/role/profile matrix.

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
3. Measure real PostgreSQL counts/latency for home, title, continue-watching and
   search through existing fixtures.
4. Complete the owner authorization matrix with focused negative tests.
5. Run focused, disposable integration and affected candidate gates; capture raw
   evidence and close Phase13 documentation.
6. Rebase on released item66 if its reviewed tree changes; publish item67 only
   after item66 merges and exact-main CI passes.

## Tests

- Domain: existing owner identifier/profile policies; no new domain rule.
- Application: substituted account/profile/title, deleted/revoked owner and
  cross-profile behavior.
- Integration: real PostgreSQL query counts/latency and no-write authorization
  checks in exact disposable fixtures.
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
  bounded JSONL measurement output.
- Acceptance result: pending.
- Iteration gate: Router/affected-owner builds and focused contract/security
  tests.
- Candidate gate: repository affected-scope gate selected from the exact diff.
- Heavyweight repeat triggers: repeat an owner PostgreSQL fixture only if its
  query path, adapter, migration, authorization policy or measurement changes;
  repeat packaged Router/browser only if schema/runtime/Web wiring changes.
- Review stopping rule: one complete initial review, one batched remediation and
  one confirmation; reopen only for a changed requirement, security/data,
  availability or public-contract blocker.

## Rollback or recovery

Revert the audit, fixture instrumentation and documentation as one item. No
schema, database, event, cache or media migration exists. If PR56 changes, do not
publish stale evidence: rebase, rerun affected contracts and only the heavyweight
measurements whose path changed.

## Documentation updates

- Phase13 evidence index and final acceptance report.
- GraphQL supergraph/security architecture and performance handbook.
- `.ai/` current state, queue, session log, handoff and decision ledger only if
  a decision changes.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
