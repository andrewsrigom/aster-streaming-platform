# Skill: System Design

## Purpose

Reason from workloads, invariants, failure boundaries, and economics rather than drawing infrastructure without justification.

## Method

1. Clarify product behavior.
2. State scale assumptions and uncertainty.
3. Identify critical user journeys.
4. Define availability, latency, durability, consistency, and cost goals.
5. Estimate request, event, storage, and bandwidth load.
6. Identify authoritative data and partition keys.
7. Design the simplest architecture that meets the goals.
8. Trace normal and failure paths.
9. identify bottlenecks and operational controls.
10. explain evolution triggers and trade-offs.

## Media-specific rule

Separate control plane from data plane.

- Control plane: catalog, authorization, playback sessions, progress, analytics.
- Data plane: manifests, segments, object storage, CDN.

Application API capacity should not scale with video bitrate.

## Capacity estimates

Show formulas and ranges. Label assumptions. Do not present fabricated precision.

Useful dimensions:

- concurrent viewers;
- playback starts per second;
- manifest and segment request rate;
- egress bandwidth;
- progress updates per second;
- GraphQL operations per second;
- cache working set;
- event throughput;
- media storage;
- transcode compute;
- database read/write IOPS.

## Consistency choices

State which operations require:

- strong consistency;
- monotonic reads or writes;
- read-your-writes;
- eventual consistency;
- best effort.

Explain user impact when stale.

## Evolution

Tie each architectural step to a signal:

- database saturation;
- cache hit degradation;
- event lag;
- origin egress;
- hot partitions;
- regional latency;
- error-budget consumption;
- deployment coupling.

Do not add multi-region writes, sharding, or specialized stores before their trigger exists.
