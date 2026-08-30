# Work Item: Multi-window SLO Burn-rate Alerts

- Status: IN_PROGRESS
- Owner: Platform
- Phase: 12
- Requirement IDs: P12-R07
- Created: 2026-08-30
- Updated: 2026-08-30

## Outcome

Aster evaluates every released critical-journey SLO with finite multi-window
burn-rate alerts. Rapid burn is classified for paging, sustained burn is
classified for a working-hours ticket, and every alert names its owner, user
impact, exact confirmation query, operational overview and runbook. Synthetic
Prometheus tests prove firing, non-firing and recovery without claiming an
external notification route or historical SLO compliance.

## Current behavior

PR49 reviewed head `ba3de93`, tree `73ee596`, passed protected run
`33318672382` and clean confirmation. Its tree-identical squash main `c297d32`
passed valid exact-main run `33319514232`, releasing P12-R12. This candidate now
adds complete-window rapid/sustained rules, exact firing/recovery fixtures and a
three-day/128 MB bounded local store. A fresh packaged image reports 35 healthy
rules, seven alert instances and no active no-traffic alerts. No external
Alertmanager route exists.

## Proposed behavior

Add one reviewed alert-policy contract and one Prometheus alert-rule file. For
each of the four existing SLIs, a rapid alert combines the standard 14.4x
one-hour/five-minute and 6x six-hour/thirty-minute pairs; a sustained alert
combines the 3x one-day/two-hour and 1x three-day/six-hour pairs. Extend the
disposable local time ceiling to three days while preserving the 128 MB size
ceiling and every query/resource bound. Load the rules locally, test them with
synthetic counters, expose no receiver, and document warm-up, retention and
delivery limits truthfully.

## Boundaries

- Owning context: Platform owns alert evaluation; each SLI retains its existing product-context owner.
- Affected services/packages: Prometheus image/configuration, SLO contract and validators, CI, runbooks and observability documentation.
- Authoritative data: owner metrics remain derived observations; alerts grant no product or release authority.
- Read models/caches: disposable Prometheus TSDB, bounded by three days or 128 MB, whichever is reached first.
- Trust boundaries: checked-in rules consume only finite aggregate metrics; annotations expose no identifiers, credentials or signed URLs.
- External dependencies: existing digest-pinned Prometheus 3.14.0 only; no Alertmanager, hosted receiver or credential is added.

## Invariants

- Alert arithmetic derives the threshold from each reviewed SLO error budget.
- Both long and short windows must burn above the same threshold.
- Empty, excluded-only and idle populations do not alert.
- Every alert has one finite SLI, owner, severity, route class, user impact,
  confirmation query, dashboard URL and runbook URL.
- No user, account, profile, title, request, trace, document or URL value becomes a metric label.
- `page` and `ticket` are routing intent only until a reviewed receiver exists.
- Local retention and synthetic tests do not become a 28/30-day compliance claim.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| No qualifying traffic | no alert vector exists | SLI population and ratio remain absent |
| One window burns but its paired window does not | alert remains inactive | long/short confirmation queries show the mismatch |
| Burn stops in the short window | alert recovers without waiting for the long window to drain | Prometheus alert state returns inactive |
| Prometheus or rules fail to load | optional observability profile is unhealthy; product owners remain unaffected | bounded Prometheus logs and health failure |
| Local history is younger or smaller than a requested window | ratio and alert stay absent; operator checks store age/retention before action | runbook records warm-up and TSDB checks |
| External notification route is absent | alert remains visible in Prometheus only | documentation explicitly states no delivery claim |

## Data and contracts

- Schema/migration: none.
- GraphQL: none.
- Events: none.
- Cache: none.
- Compatibility: additive alert rule file and alert-policy object; existing SLI names, objectives and recording series stay unchanged.
- Retention/deletion: disposable Prometheus history is capped by three days and 128 MB; normal profile teardown preserves it and explicit local reset removes it.

## Security and privacy

- Authorization: no new product endpoint or operator privilege; Prometheus remains loopback-only.
- Input limits: exactly four SLI values, two alert classes, four reviewed window pairs and seven alert instances.
- Sensitive data: annotations contain only static repository URLs, finite owner/SLI names and reviewed user-impact text.
- Abuse cases: threshold drift, one-window alerts, arbitrary label/template expansion, unbounded queries, missing runbook links and implied external delivery are rejected.

## Implementation steps

1. Record the alert/retention decision and executable policy in ADR-0043 and the SLO contract.
2. Add finite per-SLI alert rules, load them in Prometheus and preserve resource/query boundaries.
3. Add contract/adverse tests plus Prometheus firing, recovery, idle and excluded-only fixtures.
4. Link alerts to one complete critical-journey burn runbook and the operational overview.
5. Capture focused/candidate evidence and update repository memory before publication.

## Tests

- Domain: not applicable; product decisions do not change.
- Application: not applicable; alert evaluation is an operational projection.
- Integration: Prometheus 3.14.0 checks and loads both rule files; protected CI queries the packaged rules/alerts API.
- Contract: validator enforces exact SLIs, owners, windows, burn rates, thresholds, annotations, links, finite labels and retention bounds.
- Browser: not applicable; dashboard/runbook navigation is checked as a documentation/URL contract.
- Performance/failure: synthetic good, bad, failure-only, idle, excluded-only, paired-window firing and short-window recovery cases.

## Evidence

- Commands: focused Node tests, exact `promtool check rules`, exact `promtool test rules`, affected gate and protected packaged-Prometheus acceptance.
- Raw artifact path: `evidence/phase-12/slo-burn-rate-alerts.txt` and checked-in rule fixtures.
- Frozen source: `9fbc2d1`, tree `580f7ab`; evidence checkpoint and protected acceptance remain.
- Acceptance result: all seven alert instances fire only for their paired burn windows, recover through the short window and navigate to the bounded runbook/dashboard.
- Iteration gate: SLO contract tests plus exact Prometheus rule/test commands.
- Candidate gate: `pnpm check:changed`, documentation/AI checks, secret scan and `git diff --check`.
- Heavyweight repeat triggers: repeat packaged Prometheus only when the image, loaded files, configuration, alert expression or protected API assertion changes.
- Review stopping rule: one initial review and one confirmation; extend only for requirement, threshold/measurement integrity, privacy/security, availability or public-contract blockers.

## Rollback or recovery

Remove the additive alert file/policy, restore one-hour retention and rebuild the
disposable Prometheus image. No schema, product data, credential, media or
owner-service rollback is required.

## Documentation updates

- ADR-0043, SLI/SLO alert policy, critical-journey burn runbook and observability architecture.
- Phase12 evidence index and alert evidence.
- Repository state, queue, session log, decisions ledger and handoff.

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
