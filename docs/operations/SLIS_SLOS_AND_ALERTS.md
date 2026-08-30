# SLIs, SLOs, and Alerts

## Status and source of truth

P12-R05/R06 defines four initial critical-journey service-level indicators
(SLIs) and service-level objectives (SLOs). The executable contract is
[`slo-contract.json`](../../infra/observability/slo-contract.json), and
[`slo-rules.yml`](../../infra/observability/slo-rules.yml) records five-minute
population, good-event and ratio series.

The targets are initial engineering objectives, not claims about historical
availability. Local Prometheus retains one hour and cannot prove a 28- or
30-day result. Phase 14 activates release decisions from these objectives only
after a hosted store has sufficient retention, representative traffic and a
reviewed baseline.

## Evaluation model

Every SLI is a ratio:

```text
good events / population events
```

The population excludes only named events that do not represent an admitted
user attempt. Dependency failures, timeouts and unexpected server failures stay
in the denominator and count bad. An empty population has no finite ratio;
queries do not replace no traffic with artificial success. When a population
exists but the process has never exported a matching good-event series, the good
numerator is derived as zero from that same present population. A failure-only
window therefore reports zero instead of disappearing.

The five-minute recording series support operational views and later burn-rate
alerts. The objective query evaluates raw counter increases over the SLO's full
rolling window. Prometheus evaluates rules every 15 seconds, limits each rule to
eight output series and scrapes the Router privately with the same body, sample
and label limits as other local telemetry.

## Supergraph valid-operation availability

| Field | Definition |
| --- | --- |
| Population | Known GraphQL operations that pass Router admission and finish as `completed` or `failed`. |
| Good event | `completed`: no unexpected GraphQL or transport failure before the three-second Router deadline. |
| Exclusions | Unknown names collapsed to `other`; parse/validation, authentication/authorization, rate, concurrency and future cost rejections classified as `rejected`. |
| Source | Router `http_server_request_duration_seconds_count`, scrape job `aster-router`, labels `aster_operation` and `aster_outcome`. |
| Aggregation | Event ratio over a rolling 30 days; five-minute rates for operational views. |
| Owner | Platform. |
| Objective | 99.9%; error budget 0.1%. |
| User impact | A valid first-party operation cannot complete through the public application API. |

The Rhai response boundary assigns only `completed`, `rejected` or `failed`.
Any unexpected error wins over a simultaneous expected rejection. Cancellation,
subgraph failure and timeout are failures when they produce an observable failed
response. Business payload codes such as `NOT_PLAYABLE` are not Router failures
when GraphQL transport and execution complete correctly.

## Catalog title-read success and latency

| Field | Definition |
| --- | --- |
| Population | Admitted `TitleDetail` operations finishing as `completed` or `failed`. |
| Good event | `completed` in at most 300 ms. |
| Exclusions | Other operations and Router `rejected` outcomes. |
| Source | Router request-duration histogram, scrape job `aster-router`, operation `TitleDetail`. |
| Aggregation | Latency-qualified event ratio over a rolling 28 days. |
| Owner | Catalog. |
| Objective | 99.9%; error budget 0.1%. |
| User impact | A title detail page cannot obtain a timely authoritative public-visibility result. |

A correct `null` for a missing or non-public identifier is a completed Catalog
read. It does not become a failure merely because no title is visible. The
first-party/trusted-operation rollout in Phase 13 prevents arbitrary public
documents from becoming the intended hosted SLO population.

## Playback-session creation

| Field | Definition |
| --- | --- |
| Population | Owner attempts with `completed`, `unavailable`, `indeterminate` or `failed` after a valid published-title candidate reaches Playback. |
| Good event | A usable session returns as `completed` in at most 500 ms. |
| Exclusions | `not_playable`, `rejected` and `cancelled`. |
| Source | `aster_product_operation_outcomes_total` and `aster_product_operation_duration_seconds_bucket`, operation `playback_session`, scrape job `aster-local`. |
| Aggregation | Latency-qualified event ratio over a rolling 30 days. |
| Owner | Playback. |
| Objective | 99.9%; error budget 0.1%. |
| User impact | An otherwise eligible viewer cannot obtain a timely CDN-compatible playback session. |

`not_playable` is an authoritative product decision outside the valid
published-title attempt population. Dependency and indeterminate outcomes stay
bad because the viewer did attempt an otherwise eligible start.

## Progress-write acceptance

| Field | Definition |
| --- | --- |
| Population | Current valid writes with `completed`, `not_playable`, `unavailable`, `indeterminate` or `failed`. |
| Good event | The owner accepts the write or recognizes its idempotent duplicate as `completed` in at most 400 ms. |
| Exclusions | `stale`, `conflict`, `rejected` and `cancelled`. |
| Source | Product outcome and duration metrics, operation `progress_write`, scrape job `aster-local`. |
| Aggregation | Latency-qualified event ratio over a rolling 30 days. |
| Owner | Engagement. |
| Objective | 99.95%; error budget 0.05%. |
| User impact | A current valid playback checkpoint is not durably accepted within the interaction budget. |

Stale sequence and idempotency conflict remain separately measured domain
outcomes. Excluding them from this SLI does not convert them to success or hide
their rate.

## Initial error budgets

| SLO | Target | Rolling window | Bad-event budget | Maximum bad events per 100,000 population events |
| --- | ---: | ---: | ---: | ---: |
| Supergraph | 99.9% | 30 days | 0.1% | 100 |
| Catalog title read | 99.9% | 28 days | 0.1% | 100 |
| Playback start | 99.9% | 30 days | 0.1% | 100 |
| Progress write | 99.95% | 30 days | 0.05% | 50 |

These event budgets guide investigation and release risk; they do not excuse a
known correctness or security defect. The current report has no historical
compliance result because no qualifying full-window dataset exists.

## Playback first frame and media publication

First-frame and rebuffer measurements remain local diagnostics. Remote browser
sampling and server retention are zero, so there is no central population,
percentile or field SLO. See [Browser Playback Telemetry](PLAYBACK_TELEMETRY.md).

Media processing and publication retain finite product outcomes and durations.
They are operational indicators but are not one of the four initial objectives
required by P12-R06. A later objective requires representative workflow volume
and an explicit operator-impact policy.

## Alert plan

P12-R07 will implement and test multi-window burn-rate alerts from these exact
SLIs. No alert is claimed by P12-R05/R06. The planned policy is:

- page for rapid supergraph, Catalog or playback-start budget burn;
- page for data corruption or unauthorized access independently of error budget;
- create a working-hours ticket for sustained slow burn;
- keep cache, projection, queue and telemetry symptoms diagnostic unless they
  cause user impact or cross an independently actionable safety threshold.

Every implemented alert must name an owner, link to a dashboard and runbook,
state user impact, include confirmation queries and prove both firing and
recovery with controlled signals.

## Verification

The pinned Prometheus 3.14.0 `promtool` checks all nine recording rules and runs
synthetic good, bad, failure-only, excluded and excluded-only workloads. The
failure-only workload verifies both five-minute recording ratios and full-window
objective queries return zero for every journey. The synthetic mixed workload
produces ratios of 0.5 for supergraph, 0.25 for Catalog, 0.25 for playback start
and one third for progress writes. Those deliberately failing values prove
classification and arithmetic; they are not a baseline.

The repository validator rejects target/error-budget drift, prohibited
high-cardinality query text, a missing finite Router classification, a missing
private scrape boundary, a missing population-derived zero numerator and attempts
to turn no traffic into 100% success.
