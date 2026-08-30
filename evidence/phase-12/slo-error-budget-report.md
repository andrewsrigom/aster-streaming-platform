# Initial SLO and Error-Budget Report

Status: **implemented definition; historical compliance unavailable**

Date: 2026-08-30

Source: `c4e6a76c438d44abacc47db1a0407f16634a90cc`, tree `cfc21f6d6226e3d7c08b9d2ac97ba36d5dbabcd2`

Source base: `6dba10e0ec74891af8d4427836381a4190b20376`

Environment: WSL Ubuntu-20.04, Prometheus 3.14.0 `promtool` synthetic evaluation

Runtime verification: protected run `33310118280` passed at evidence head
`aca4aba6e60b62d9ac0d28d23bdca9ea4da2788c`. The later failure-only correction
passed protected run `33311729108`; the subsequent idle-window correction is
locally verified and still requires protected acceptance.

## Objectives

| Journey | Owner | Target | Window | Good-event latency | Error budget | Bad events per 100,000 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Supergraph valid operation | Platform | 99.9% | 30 days | Router deadline, 3 s | 0.1% | 100 |
| Catalog title read | Catalog | 99.9% | 28 days | 300 ms | 0.1% | 100 |
| Playback-session creation | Playback | 99.9% | 30 days | 500 ms | 0.1% | 100 |
| Progress-write acceptance | Engagement | 99.95% | 30 days | 400 ms | 0.05% | 50 |

The error budget is `1 - target`. Counts are event budgets, not permitted
downtime. A known security, authorization, data-integrity or rights defect blocks
release regardless of remaining budget.

## Current compliance result

No objective has a historical pass/fail result. The local Prometheus store is
capped by three days/128 MB and the project has no representative hosted
28/30-day traffic window. Reporting `100%`, `0%` or an extrapolated result would
be unsupported.

The synthetic rule workload intentionally produces ratios below every target:

| Journey | Synthetic ratio | Interpretation |
| --- | ---: | --- |
| Supergraph | 50% | two good and two bad events per second in population |
| Catalog title read | 25% | 0.5 latency-qualified good events across 2 population events per second |
| Playback start | 25% | excluded not-playable/rejected events do not change the denominator |
| Progress write | 33.3333% | excluded stale/conflict/rejected events do not change the denominator |

These values prove query behavior only. They are not a baseline or service
quality result.

## Activation and review

Before an SLO controls a hosted release, Phase 14 must provide:

1. a metric store retaining at least the complete objective window;
2. representative first-party traffic with controlled synthetic traffic marked
   or excluded before aggregation;
3. a baseline report and product/owner review of target realism;
4. released burn-rate alerts and linked runbooks proven to fire and recover;
5. dashboards separating user impact, dependency health and saturation;
6. post-deployment smoke and query verification.

Target changes require evidence and review; they cannot silently rewrite a
window already being evaluated.

## Evidence and limitations

Exact query definitions and commands are in
[`sli-query-definitions.txt`](sli-query-definitions.txt). The machine-readable
contract is
[`slo-contract.json`](../../infra/observability/slo-contract.json). Browser
first-frame has no field objective because remote sampling and retention remain
zero. Media publication remains a finite operational indicator, not one of the
four initial P12-R06 objectives.
