# Work Item: Phase 11 failure game days and operational closeout

- Status: IN_PROGRESS
- Owner: Platform coordinates evidence; each bounded context owns its failure behavior and recovery
- Phase: 11
- Requirement IDs: P11-R06, P11-R07, P11-R10, P11-R11, P11-R12
- Created: 2026-08-30
- Updated: 2026-08-30

## Outcome

Phase 11 closes with current-source evidence that finite bulkheads, safe
Discovery fallback, single-layer retry ownership and recovery behave as written
under Discovery outage, Redis outage, broker delay/outage, database saturation
and media-worker failure. Every scenario has a bounded timeline, user impact,
detection, mitigation, recovery verification and exact runbook; no test-only
control becomes a product route or production switch.

## Current behavior

P11-R01 and P11-R05 are released. P11-R08/R09 is frozen at corrected evidence
head `371ba55eb7269520b72f41fd813a95aaeab819eb` on PR43. Initial review found a
startup/close race; source `896a3df` corrected it, focused tests pass 11/11 and
the affected candidate gate passes 11/11. The discussion is resolved, exact-head
protected run `33291705269` and the single confirmation review are running. The
item provides private deterministic failure mechanics and is the one allowed
`WAITING_EXTERNAL` predecessor.

Existing current production behavior already has finite request, search,
owner-read, event-consumer, database-pool and media-processing capacity. Earlier
acceptance separately proves Web Discovery fallback, Redis degraded reads,
broker outage/outbox recovery, database admission and media process-tree
cancellation. Those facts are scattered across phases and were not yet executed
or reconciled as the named Phase 11 game days with current-source applicability
and complete operator procedures.

## Proposed behavior

Do not add production behavior unless a named experiment exposes a requirement
gap. Consolidate the existing exact controls into five bounded game days. Use
the current protected PR43 run once for real disposable Discovery, Redis,
broker and owner-runtime evidence. Repeat only cheap current-source focused
tests for database load shedding, retry amplification, fallback, duplicate
delivery and media process cancellation. Carry forward a heavyweight browser or
media artifact only after proving later source cannot affect its measured
boundary. Record explicit non-applicability instead of inventing a dashboard,
SLO or production capacity claim.

## Boundaries

- Owning contexts: Discovery owns optional projections/fallback; Catalog, Identity and Engagement own durable writes/outboxes; Media owns worker execution; Platform owns shared policy and runbooks.
- Affected services/packages: documentation/evidence plus focused existing runtime, Web, Catalog, Discovery, Engagement, event-delivery and media tests.
- Authoritative data: PostgreSQL owner writes and rights/publication state remain unchanged.
- Read models/caches: Discovery projection and bounded stale Redis data remain non-authoritative.
- Trust boundaries: disposable Docker projects, synthetic fixtures, private failure lab, exact GitHub run logs and operator commands.
- External dependencies: existing pinned PostgreSQL, Redis, Kafka-compatible broker, FFmpeg/media image and GitHub Actions only.

## Invariants

- Optional failure never weakens identity, authorization, rights or publication checks.
- No unsafe mutation gains an automatic retry; one operation class has one retry owner.
- Request, database, consumer and worker admission remain finite; overflow has an explicit result.
- Redis loss cannot corrupt or acknowledge durable state.
- Broker delay retains the owner outbox and drains without duplicate durable effects.
- Media failure publishes no partial output and releases or safely retains only run-owned scratch.
- Every experiment has a terminal deadline, cleanup scope and recovery assertion.
- Historical heavyweight evidence is reused only with an explicit unaffected-source proof.
- Shared-host timings are laboratory observations, not field SLOs or capacity promises.

## Failure behavior

| Failure | Expected behavior | Telemetry/evidence |
|---|---|---|
| Discovery total outage | public Catalog browse/playback remain; home degrades explicitly; recovery restores search | Router/Web result, outage/recovery timeline |
| Redis outage | owner-fenced reads and writes remain correct under bounded bypass/local shield | degraded readiness, source load and durable result |
| Broker delay/outage | owner write/outbox continues; consumer lag grows then drains idempotently | outbox/offset/lag and duplicate-effect proof |
| Database saturation | finite admission rejects overflow before unbounded owner work; unrelated capacity remains | admitted/rejected counts and recovery |
| Media worker failure | process group is killed, failure audit retained, no public candidate appears, scratch cleanup is bounded | worker exit/failure/cleanup evidence |
| Transient owner read across layers | exactly one service-owned retry; Web/Router do not amplify | invocation/attempt matrix |
| Runbook or evidence mismatch | Phase remains open; correct the owner behavior or documentation | failed closeout validator/review |

## Data and contracts

- Schema/migration: none planned.
- GraphQL: existing explicit partial, fallback, unavailable and limit results remain unchanged.
- Events: existing versioned envelopes, owner outboxes, idempotency and quarantine remain unchanged.
- Cache: existing bounded stale/bypass behavior only; Redis is never promoted to authority.
- Compatibility: documentation/evidence closeout; production contracts remain unchanged unless a demonstrated blocker requires a separate narrow correction.
- Retention/deletion: every disposable project uses exact labels/project names and removes only its own containers, networks, volumes and temporary files.

## Security and privacy

- Authorization: fail closed remains in owning services; fallback is public editorial data only.
- Input limits: existing GraphQL, event, cache, process and failure-lab bounds remain active during experiments.
- Sensitive data: evidence records finite event names/counts, not tokens, cookies, credentials, profile IDs, raw queries or signed URLs.
- Abuse cases: public fault selection, unbounded retry, infinite queue, broad Docker cleanup, forged owner state and partial media publication remain prohibited.

## Implementation steps

1. Map every remaining Phase 11 requirement and required artifact to exact current code/tests/evidence.
2. Collect the single current protected run's Discovery/Redis/broker events and verify cleanup.
3. Run focused current-source database saturation, fallback/retry-amplification and media-failure checks.
4. Write five game-day timelines, fallback/amplification/saturation reports and explicit carry-forward reasoning.
5. Expand runbooks with trigger, impact, confirm, mitigate, diagnose, recover, verify, rollback, escalation and follow-up evidence.
6. Run documentation/traceability and affected candidate gates, review once and close the phase only after protected release.

## Tests

- Domain: safe fallback classification, retry safety and media failure classification already owned by focused suites.
- Application: bulkhead overflow, duplicate event/idempotency, cancellation and outbox recovery.
- Integration: current protected disposable PostgreSQL, Redis, broker and service runtimes plus exact cleanup.
- Contract: Router/Web no-automatic-retry ownership and explicit GraphQL degraded/limit outcomes.
- Browser: carry forward Discovery outage only if relevant Web/Router behavior is source-equivalent; otherwise repeat the one bounded scenario.
- Performance/failure: database admission and worker process-group cancellation; no throughput/SLO claim.

## Evidence

- Commands: exact protected run log extraction, focused owner tests, repository documentation/AI checks, then `pnpm check:changed`.
- Raw artifact path: `evidence/phase-11/game-days.md`, `bulkhead-saturation.txt`, `retry-amplification.txt`, existing Phase 11 artifacts and updated runbooks.
- Acceptance result: five bounded timelines, explicit fallback examples, attempt matrix, cleanup and recovery facts at exact commits/runs.
- Iteration gate: the cheapest focused current-owner test and documentation validator for each mapped scenario.
- Candidate gate: complete affected-scope gate plus Phase 11 traceability, repository-memory and runbook links.
- Heavyweight repeat triggers: runtime code affecting a named scenario repeats that exact disposable experiment; unchanged browser/media behavior may carry forward only with source-object proof; prose-only corrections repeat documentation/AI/format gates.
- Review stopping rule: one complete review and one confirmation; only requirement, authority/security/data invariant, availability, recovery, evidence-integrity or public-contract blockers extend it.

## Rollback or recovery

Documentation/evidence changes revert without product state. Any disposable
experiment removes only its exact project resources. If an experiment exposes a
product defect, keep Phase 11 open, record the failed run and implement the
smallest owner correction with its affected gate before repeating only the
invalidated scenario.

## Documentation updates

- Phase 11 evidence index and release record.
- Operational runbooks, resilience/failure architecture, feature/status matrix and repository memory.

## Completion checklist

- [x] Remaining requirements mapped and current
- [x] Five game days pass with cleanup
- [x] Fallback, saturation and retry-amplification evidence captured
- [x] Runbooks complete and linked
- [ ] Candidate and protected gates pass
- [ ] Phase 11 release and Phase 12 prerequisites recorded
