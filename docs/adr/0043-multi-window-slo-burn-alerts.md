# ADR-0043: Evaluate finite multi-window SLO burn-rate alerts

- Status: Accepted
- Date: 2026-08-30
- Owners: Platform, Catalog, Playback, Engagement
- Related requirements: P12-R07
- Supersedes: ADR-0042's one-hour Prometheus time ceiling only
- Superseded by: none

## Context

Aster has four executable critical-journey SLIs with reviewed objectives and
error budgets. Five-minute recordings and the operational overview make current
impact visible, but they do not distinguish a short spike from budget burn that
requires an immediate or working-hours response. The local Prometheus store
retains only one hour, which cannot evaluate the longer pairs used by a standard
multi-window policy.

An alert must remain a derived operational signal. It cannot authorize product
behavior, convert no traffic into success or failure, expose an identifier, or
claim notification delivery when no Alertmanager receiver exists.

## Decision

Evaluate rapid alerts for supergraph, Catalog title read and playback start.
Evaluate sustained alerts for all four released SLIs:

| Class | Long window | Short window | Burn rate | Response intent |
|---|---:|---:|---:|---|
| Rapid | 1 hour | 5 minutes | 14.4x | page |
| Rapid | 6 hours | 30 minutes | 6x | page |
| Sustained | 1 day | 2 hours | 3x | working-hours ticket |
| Sustained | 3 days | 6 hours | 1x | working-hours ticket |

Each pair requires both its long and short error ratios to exceed the same
multiple of that SLO's error-budget fraction. The two rapid pairs feed one alert
name and the two sustained pairs feed another, producing exactly seven possible
SLI/alert instances. Progress loss is durable-interaction impact but does not
interrupt active viewing, so it creates a sustained working-hours ticket rather
than a rapid page. The dual-window condition supplies persistence and fast
recovery; no separate `for` or `keep_firing_for` delay is added.

Window ratios integrate the already reviewed five-minute good and population
rates at a five-minute resolution. The ratio remains population-weighted, and a
positive integrated population plus complete sampled coverage of the requested
window are required. This keeps fresh, size-evicted, excluded-only, idle and
no-traffic windows absent while bounding each rule query below the existing
sample ceiling.

Extend the optional local Prometheus time ceiling from one hour to three days.
Retain its 128 MB size ceiling, two-second query timeout, two-query concurrency,
10,000-sample ceiling, loopback listener, finite scrapes and 256 MiB process
limit. Retention is therefore at most three days and may be shorter when the
size ceiling wins. The corresponding ratio and alert remain absent until the
store contains complete sampled coverage of that window.

Every alert has a finite SLI, owner, severity, response intent, user-impact
annotation, current confirmation query, dashboard URL and runbook URL. `page`
and `ticket` classify response intent only. Prometheus exposes alert state
locally; external routing, receivers, credentials and escalation schedules
remain Phase 14 work.

## Rationale

Multi-window, multi-burn-rate alerts connect urgency to error-budget consumption
while requiring evidence that burn is still active. Reusing the released
five-minute rate recordings avoids duplicating the four raw SLI classifications
and keeps long-window query work bounded. The unchanged size cap prevents the
longer time ceiling from becoming an unbounded local disk commitment.

## Consequences

### Positive

- Rapid and sustained user impact have distinct, testable response intent.
- One policy applies consistently while thresholds still derive from each SLO.
- Short windows make an alert recover soon after active burn stops.
- Synthetic Prometheus tests can prove firing and recovery deterministically.

### Negative

- Five-minute input rates introduce boundary smoothing of up to one recording window.
- A fresh or size-evicted local store keeps the affected long-window alert inactive.
- Prometheus shows alert state but does not deliver notifications by itself.

### Operational

- Confirm the alert against its linked current SLI and paired burn-window queries.
- Check TSDB age/retention before interpreting a long-window result.
- If rules fail to load, only the optional observability profile becomes unhealthy.
- Product owners, GraphQL, playback and durable writes do not depend on alert evaluation.

### Security and privacy

- Rule selectors use only the finite `sli` vocabulary and released aggregate series.
- Labels and annotations contain no account, profile, title, request, trace,
  GraphQL document, signed URL, credential or arbitrary error value.
- Prometheus remains loopback-only; no receiver, secret or additional listener is added.

## Alternatives considered

### Alert only on the current five-minute ratio

Rejected because a single spike has poor precision and no explicit
error-budget-consumption policy.

### Add Alertmanager and a hosted receiver now

Deferred because delivery requires credentials, operator identity, escalation
ownership and hosted lifecycle decisions outside P12-R07.

### Keep one-hour retention and load longer rules anyway

Rejected because sustained rules would evaluate permanently incomplete local
windows. The bounded three-day/128 MB policy makes the intended local mechanics
possible without claiming guaranteed history.

### Query raw counters independently for every SLI/window

Rejected because it duplicates released classifications and materially widens
long-range sample work. Population-weighted integration of reviewed recordings
is sufficient for this alerting policy.

## Validation

Repository checks derive every threshold from `slo-contract.json`, require the
exact finite rules/annotations/links and reject retention or label widening.
Prometheus 3.14.0 checks both rule files. Synthetic tests cover rapid firing for
the three page-class SLIs, sustained firing for all four, incomplete-history and
one-window suppression, no traffic, excluded-only traffic and short-window
recovery. Protected CI loads the baked rules and queries the rules and alerts
APIs.

## Revisit triggers

- A hosted receiver requires an Alertmanager routing, identity, secret and escalation ADR.
- A different SLO target/window requires new baseline evidence and regenerated thresholds.
- A scrape or recording interval change requires revalidating integration accuracy and sample bounds.
- Local retention pressure that reaches 128 MB before three days requires measured capacity review, not silent widening.

## Migration

Bake the additive alert file, load it beside the existing SLI rules and restart
only the disposable observability profile. Rollback removes that file/policy and
restores the one-hour time ceiling. Product schemas and durable data do not
change.

## Sources

- [Google SRE Workbook: Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [Prometheus alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
