# Work Item: Bounded GraphQL Demand Controls

- Status: IN_PROGRESS
- Owner: Platform
- Phase: 13
- Requirement IDs: P13-R03, P13-R04, P13-R05, P13-R10
- Created: 2026-08-31
- Updated: 2026-08-31

## Outcome

Aster rejects oversized and parser-hostile requests before expensive work and
admits in hosted environments only reviewed first-party operations whose depth,
aliases, roots, selections, list expansion and backend-weighted cost fit one
source-controlled budget. Owner pagination remains authoritative. Batching,
introspection and public error detail stay disabled. The policy is reproducible
without credentials or a hosted control plane and emits a finite calibration
report.

## Current behavior

Item64 final source correction `a353164b36a7124c1721915ee07be09ca561de78`,
evidence head `de50b3ee98a3a8686c359a96e00113a709ce5dad`, passed protected
run `33410126892` and clean confirmation. PR52 squash main
`fb5cf0147a3a306f4186b1717fee53ed787bd3a6` retained candidate tree
`a78f09598f19b05cd552664c1ad68e5bdcd2d43a`; exact-main run `33412728404`
passed. The predecessor is released and this item is rebased onto it.

The Router already enforces 32 KiB bodies, 2,000 parser tokens, recursion32,
512 recursive selections, three-second execution, concurrency8 and a finite
global burst. Introspection, APQ, sandbox, homepage, batching and subgraph error
detail are disabled. Exact trusted-operation admission prevents arbitrary
hosted shapes. Owners enforce finite page/input bounds. Source
`36b6af2cb114aa4dad2afddc39142ad5e5878c28`, tree
`e8fc58bbcbe3899b7b420adcdedfbd867173de0b`, now calculates depth, aliases,
roots, selections, list expansion and backend-weighted cost for every exact
reviewed operation, fails excessive or incomplete metadata, and emits a bounded
25-operation calibration artifact. Router18/18 and the rebased affected
candidate gate51/51 pass; the packaged protected runtime proof and release
remain pending.

## Proposed behavior

Upgrade subgraph Federation links to the supported version that defines standard
`@cost` and `@listSize`. Annotate resolver work and every selected list with
finite owner-backed weights and sizes. A deterministic build analyzer consumes
the composed public schema and the exact trusted-operation body/hash set,
expands fragments once under explicit bounds, resolves variable/default page
sizes conservatively and records depth, aliases, roots, selections, maximum list
expansion and static cost.

Composition fails on missing/invalid metadata, overflow, unresolved sizing or an
operation above any reviewed maximum. It emits one bounded versioned demand
manifest beside the trusted manifest. Because hosted admission accepts only the
same exact hashes after the analyzer passes, over-budget operations cannot reach
planning. Local/integration audit remains a development path protected by the
existing parser, owner and execution bounds. Protected CI sends oversized,
token-heavy, batched and introspection requests to the pinned packaged Router
and retains the playable journey.

## Boundaries

- Owning context: Platform owns public demand admission and generated evidence;
  each bounded context owns resolver work, pagination and authorization.
- Affected code: five owner SDL contracts, `@aster/router`, generated artifacts,
  Router/runtime proof, CI policy and GraphQL/security/operations documentation.
- Authoritative data: owner PostgreSQL stores remain authoritative; generated
  demand metadata is source-derived policy only.
- Read models/caches: no product cache/read-model change; Router plan cache stays
  bounded and APQ stays disabled.
- Trust boundaries: request bytes, tokens/documents/variables, operation sources
  and schema annotations are untrusted until validated.
- External dependencies: existing pinned Apollo composition, Router and GraphQL
  packages only; no account, key, paid resource, new service or package.

## Invariants

- Network body/parser limits run before query planning and subgraph work.
- Hosted shape/cost enforcement cannot be bypassed because only exact analyzed
  trusted hashes are admitted.
- Every list reachable from a trusted operation has a finite owner-backed size;
  owner pagination rejects the same or a stricter maximum at runtime.
- Weights distinguish scalar/in-memory shape, owner I/O, mutation work and
  federated fan-out; cost supplements dependency bounds.
- Missing/conflicting metadata, excessive demand or stale artifacts fail the
  build rather than choosing an implicit safe-looking default.
- Batching, introspection, sandbox and detailed upstream errors stay disabled.
- Query text, variables, hashes, identifiers and raw numeric cost never enter
  metric labels or public errors.
- Item64 merges and passes exact-main CI before this item publishes.

## Failure behavior

| Failure | Expected behavior | Evidence/telemetry |
| --- | --- | --- |
| Body exceeds32 KiB | Router returns bounded4xx before GraphQL execution | finite rejection outcome |
| Document exceeds2,000 tokens or parser recursion | Router returns sanitized4xx before planning | finite rejection outcome |
| Source exceeds shape/list/cost policy | composition fails; no artifact/image publication | operation name plus finite rule |
| Cost/list metadata missing, invalid or conflicting | composition fails | schema coordinate plus finite rule |
| Introspection or batched request | public Router rejects without alternate path | sanitized bounded response |
| Demand artifact missing/stale | schema check/image publication fails | bounded build finding |
| Owner page input exceeds maximum | owning service rejects sanitized input | existing finite owner result |

## Data and contracts

- Schema/migration: additive Federation metadata only; no public field, database
  or event migration.
- GraphQL: trusted operation documents/hashes stay unchanged; generated demand
  profiles extend the delivery contract.
- Events: none.
- Cache: no response/Redis behavior change; plan cache stays128.
- Compatibility: every current Web document must retain its exact hash and pass
  the calibrated budget; local audit is not a hosted bypass.
- Retention: generated manifests follow source/image history and contain no
  request or user data.

## Security and privacy

- Authorization: demand admission never grants account/profile/operator or
  resource authority; owning services still authorize.
- Input limits: 32 KiB body,2,000 tokens, finite recursion/selections plus
  calibrated depth, alias, root, list and cost maxima.
- Sensitive data: operation names and finite outcomes/bands only; no query,
  variable, hash, identifier or signed URL in telemetry/evidence.
- Abuse: oversized bytes, ignored-token amplification, deep nesting, aliases,
  repeated roots/fragments, list multiplication, expensive federation, batching,
  introspection, stale artifacts and sanitized errors receive adverse coverage.

## Implementation steps

1. Record the source-owned shape/list/cost decision and alternatives in ADR-0046.
2. Upgrade Federation links and add validated owner-backed cost/list metadata.
3. Implement deterministic shape/cost analysis and generated demand artifact.
4. Bind trusted generation to the passing profile and finite telemetry policy.
5. Add unit/adverse, schema/client, packaging, CI-policy and real Router proofs.
6. Capture calibration, update docs/memory and run candidate acceptance.

## Tests

- Domain: existing owner page/list maxima remain authoritative.
- Application: analyzer fixtures cover fragments, variables/defaults, nested
  lists, aliases, roots, mutations, missing metadata and numeric overflow.
- Integration: pinned Router rejects oversized/token-heavy/batched/introspection
  requests before owner work and accepts every canonical client operation.
- Contract: Federation metadata composition, exact hash/profile cardinality,
  generated staleness/bounds and Docker packaging.
- Browser: protected Docker playable journey proves compatibility.
- Performance/failure: calibration reports all current operations and exact
  boundary decisions; item66 owns measured SQL/N+1/latency.

## Evidence

- Raw artifact: `evidence/phase-13/graphql-demand-controls.txt` and generated
  demand manifest.
- Acceptance: rebased source/candidate evidence passes; packaged runtime, review
  and release remain pending.
- Iteration gate: Router analyzer/composition tests, affected owner schema tests,
  format/lint and `git diff --check`.
- Candidate gate: `CI=true NODE_OPTIONS=--max-old-space-size=1536
  TURBO_CONCURRENCY=4 pnpm check:changed`, documentation/AI and secret checks.
- Heavyweight repeat triggers: repeat packaged abuse/browser proof when Router
  limits, trusted documents, schema metadata, analyzer, artifacts, Rhai,
  image/config or client transport changes.
- Review stopping rule: one complete initial review and one confirmation; extend
  only for requirement, budget integrity, security/privacy, availability,
  authorization or public-contract blockers.

## Rollback or recovery

Restore the item64 Router image/config, Federation SDLs and ten-artifact
generation set. No product data, database, Redis, event, media or credential
rollback is required. Roll forward by adding compatible metadata/operations
before raising any reviewed budget.

## Documentation updates

- ADR-0046, GraphQL/security architecture, Router configuration and release.
- Phase13 calibration/evidence, repository state, queue, session log and handoff.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
