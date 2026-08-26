# Extension: Scheduled Live Channel

## Status

Deferred until VOD release and operations are verified.

## Product outcome

Create one or more scheduled linear channels from approved on-demand publications without accepting arbitrary live ingest initially.

## Why scheduled linear first

A scheduled channel reuses reviewed media and avoids the first version of real-time creator ingest, moderation, encoder contribution, and unpredictable source reliability.

## Architecture

```text
Schedule service
→ playout planner
→ publication assets
→ channel packager
→ live HLS origin
→ CDN
→ player
```

## New concerns

- wall-clock synchronization;
- program schedule and electronic program guide;
- discontinuities;
- live playlist window;
- channel start-over policy;
- regional time;
- missed segments;
- packager failover;
- ad or slate policy;
- concurrent channel capacity;
- live SLI and alerting.

## Rights

A title approved for VOD is not automatically approved for scheduled linear presentation. Extend the rights record with allowed distribution modes before use.

## Resilience

- redundant playout plan;
- deterministic fallback slate with approved rights;
- packager health;
- segment-age alert;
- CDN live-manifest monitoring;
- recovery without sequence corruption.

## Player

Add live edge, seekable window, program metadata, and recovery from discontinuity. Keep VOD player behavior isolated behind a shared media adapter.

## Exit requirements

- separate ADRs for schedule ownership and live packaging;
- load and failover evidence;
- rights-mode verification;
- runbook for stale manifest and packager failure;
- no regression to VOD delivery.
