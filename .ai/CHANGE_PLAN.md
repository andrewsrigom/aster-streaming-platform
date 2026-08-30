# Work Item: Executable Critical-Journey SLIs and Initial SLOs

- Status: IN_PROGRESS
- Owner: Platform, with Catalog, Playback and Engagement journey owners
- Phase: 12
- Requirement IDs: P12-R05, P12-R06
- Created: 2026-08-30
- Updated: 2026-08-30

## Outcome

Aster has executable, finite and tested service-level indicator (SLI)
definitions for supergraph availability, Catalog title reads, playback-session
creation and progress writes. Each definition names its population, good event,
exclusions, source, aggregation, owner and rolling objective window. Initial
service-level objectives (SLOs) and mathematical error budgets are explicit
without claiming production history that the local one-hour store cannot prove.

## Current behavior

The candidate classifies released backend and Router outcomes into four finite
journey SLIs. Prometheus privately scrapes the Router and Collector, evaluates
nine synthetic-tested rules and retains one disposable hour. The Router view
exports the exact 300 ms Catalog boundary, and the product histogram exports the
exact 400 ms progress boundary. Repository validators reject either threshold
when its runtime bucket is absent. Protected CI requires each live ratio series
and accepts its measured value only in the valid inclusive range from zero to
one. Protected run `33310118280` passes that packaged runtime at evidence head
`aca4aba`. Final confirmation then found that a failure-only window omitted its
ratio when no completed label set had ever existed. Source `757f6a0`, tree
`e9c7d24`, derives zero only from a present population for recording and full-
window queries and adds a pinned failure-only workload. Browser QoE still has
zero remote sampling and is not a central first-frame SLI.

## Proposed behavior

Classify every known Router response as `completed`, `rejected` or `failed` in
the existing Rhai boundary and attach only the finite operation/outcome context
to the standard Router request-duration histogram. Scrape that private endpoint
with existing Prometheus limits. Add bounded recording rules for population,
good-event and good-ratio rates over five minutes, then validate the exact
PromQL with synthetic good, bad and excluded events using the pinned Prometheus
`promtool`. Publish a machine-readable contract and a truthful initial
error-budget report for the four required journeys.

## Boundaries

- Owning context: Platform owns aggregation; Catalog, Playback and Engagement own their journey semantics and remediation.
- Affected services/packages: Apollo Router configuration/Rhai, local Prometheus configuration/image, platform verification tools and Phase12 documentation/evidence.
- Authoritative data: product owners and PostgreSQL remain authoritative; metrics authorize no result.
- Read models/caches: Prometheus recording series are disposable operational projections.
- Trust boundaries: untrusted GraphQL requests enter Router admission; only known operation buckets and three finite outcomes reach metrics.
- External dependencies: exact-pinned Apollo Router 2.17.0 and Prometheus 3.14.0 already accepted by ADRs and runtime policy.

## Invariants

- No user, account, profile, title, request, trace, URL, document or arbitrary operation name becomes an SLI label.
- Expected validation, authorization and admission rejections are excluded, not hidden as availability success or failure.
- Dependency, timeout and unexpected server failures remain in the population and count bad.
- A zero population does not become artificial 100% availability.
- A present failure-only population produces a zero good-event ratio rather than
  an absent series.
- Playback `not_playable` and rejected/cancelled requests do not enter the valid published-title attempt population.
- Progress stale, conflict, rejected and cancelled outcomes remain separately measurable but outside valid current-write population.
- Browser first-frame remains explicitly unavailable as a field SLO while remote sampling is zero.
- The one-hour local Prometheus retention proves query mechanics, not a 28/30-day historical objective.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Router validation/auth/admission rejection | return the existing sanitized response | finite `rejected`, excluded from SLI population |
| Router/subgraph timeout or unexpected error | preserve existing failure response | finite `failed`, included as bad |
| Collector/product signal absent | product work remains unchanged | affected SLI has no sample; no fabricated good event |
| Router scrape unavailable | product traffic remains independent | Prometheus target down; Router SLI series becomes absent |
| Rule evaluation has zero population | expose no usable ratio | population, good and ratio series remain absent |
| Rule evaluation has population but no good series | expose a zero ratio | derive zero only from the same present population |
| Prometheus rule/config malformed | fail image/config/CI validation | candidate cannot publish |
| Telemetry callback throws | existing product result remains authoritative | owner wrapper already isolates failure |

## Data and contracts

- Schema/migration: none.
- GraphQL: no schema or response change.
- Events: none.
- Cache: none.
- Compatibility: additive Router metric attributes, scrape target, recording series and machine-readable SLO contract.
- Retention/deletion: rules use the existing disposable one-hour local store; no browser or durable product retention is added.

## Security and privacy

- Authorization: owners continue enforcing authorization; SLO classification cannot bypass or grant access.
- Input limits: the existing finite operation allowlist collapses every other name to `other`; three outcome values and four SLI IDs are accepted.
- Sensitive data: queries consume counters/histograms only; raw documents, IDs, errors and signed URLs are prohibited and regression-tested.
- Abuse cases: arbitrary operation names, validation floods, expected rejection inflation, no-traffic windows, cardinality overflow and malformed rule/config input.

## Implementation steps

1. Freeze the P12-R11 predecessor and record this dependent work item.
2. Add finite Router result classification and standard histogram attributes; cap metric cardinality.
3. Scrape the private Router metric endpoint and bake versioned SLI recording rules into the existing Prometheus image.
4. Add the machine-readable SLI/SLO contract and `promtool` synthetic good/bad/exclusion tests.
5. Verify rule/config policy, actual Router labels and both supergraph and Catalog recorded series in protected Docker CI.
6. Replace provisional prose with exact definitions, error budgets, limitations and evidence.

## Tests

- Domain: not applicable; no owner decision changes.
- Application: deterministic contract validator checks four required journeys, finite labels, targets, windows and error-budget arithmetic.
- Integration: exact Apollo Router config validation plus protected private Router scrape and Prometheus rule loading/evaluation.
- Contract: pinned `promtool check rules` and `promtool test rules` with good, bad, excluded and mixed events.
- Browser: not repeated; Web behavior and remote sampling are unchanged.
- Performance/failure: cardinality ceiling and zero-population semantics; no throughput claim.

## Evidence

- Commands: focused Node contract tests, Router tests/schema/config validation, platform policy tests, `promtool` rule checks, affected candidate gate and one protected runtime proof.
- Raw artifact path: `evidence/phase-12/sli-query-definitions.txt` and `evidence/phase-12/slo-error-budget-report.md`.
- Acceptance result: all four required SLIs have executable queries whose synthetic outputs match their written population/exclusion/good-event rules.
- Iteration gate: focused SLO contract test, Router composition tests and platform policy tests.
- Candidate gate: `pnpm check:changed`, documentation/AI checks, secret scan and `git diff --check`.
- Heavyweight repeat triggers: repeat the protected Router/Prometheus runtime only if Router context, scrape config, rules, image or CI assertion changes; do not repeat browser/media/rights experiments.
- Review stopping rule: one initial review and one confirmation; extend only for requirement, security/privacy, measurement-integrity, availability or public-contract blockers.

## Rollback or recovery

Remove the additive recording rules and Router scrape job, then restore the
standard Router metric configuration. Prometheus data is disposable and no
product state, schema, event or media object requires migration.

## Documentation updates

- Formal SLI/SLO definitions and error-budget interpretation.
- Observability architecture and local operations.
- Phase12 evidence index and raw query/report artifacts.
- Repository state, queue, session log and handoff.

## Completion checklist

- [x] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
