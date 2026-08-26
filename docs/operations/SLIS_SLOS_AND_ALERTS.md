# SLIs, SLOs, and Alerts

## Status

These are initial definitions to implement and calibrate in Phase 12. Numeric targets remain provisional until baseline evidence exists.

## SLI 1 — Supergraph valid-operation availability

**Population:** GraphQL requests that pass authentication and request-shape validation.

**Good:** Response completes within the service deadline without an unexpected server error.

**Excluded:** deliberate validation, authorization, trusted-operation, rate, and cost rejections. Each exclusion remains separately measured.

**Source:** Apollo Router metrics.

**Provisional objective:** 99.9% over a rolling 30-day window.

## SLI 2 — Catalog title read

**Population:** requests for existing published title IDs.

**Good:** correct title response under 300 ms at the router.

**Source:** router operation metrics and Catalog traces.

**Provisional objective:** 99.9% success and 95% under 300 ms over 28 days.

## SLI 3 — Playback-session creation

**Population:** valid requests for currently published titles.

**Good:** usable session returned within 500 ms.

**Bad:** timeout, internal error, dependency failure, or unusable delivery reference.

**Source:** Playback operation metrics.

**Provisional objective:** 99.9% over 30 days.

## SLI 4 — Playback first frame

**Population:** sampled player sessions that attempt media load after a successful playback session.

**Good:** first frame observed within the target and no fatal error before it.

**Source:** privacy-reviewed browser telemetry.

**Target:** calibrated after browser, geography, network, and CDN baselines.

## SLI 5 — Progress write

**Population:** valid current progress reports.

**Good:** accepted or recognized duplicate within 400 ms.

**Separate outcomes:** stale, unauthorized, invalid, and conflict.

**Provisional objective:** 99.95% over 30 days.

## SLI 6 — Media publication

**Population:** processing attempts that reach technical validation with an approved current rights record.

**Good:** validated immutable package is published or a classified deterministic content failure is returned within workflow bounds.

Operational platform failures count as bad.

## Alert strategy

### Page

Use for rapid budget burn or immediate critical user impact:

- playback-session SLO fast burn;
- supergraph broad failure;
- catalog authority unavailable with exhausted safe fallback;
- active publication objects missing;
- data corruption or unauthorized access;
- database saturation with rising failures.

### Ticket or working-hours alert

- slow burn;
- cache hit degradation without user SLO impact;
- projection lag within safe window but increasing;
- media queue age;
- backup warning;
- elevated noncritical discovery fallback;
- telemetry drops.

## Alert content

Every alert includes:

- SLO or symptom;
- environment;
- current value and threshold;
- first observed time;
- user impact;
- dashboard;
- trace query;
- runbook section;
- owner;
- recent deployment link.

## Testing

Each alert is tested with synthetic signals or controlled failure. Recovery notification is verified. Alerts that cannot be acted upon are removed or redesigned.
