# Scale Assumptions

## Purpose

These assumptions provide a shared capacity model. They are not traffic claims. Phase 14 replaces them with measured values where possible.

## Initial validation target

- 100,000 monthly active viewers;
- 10,000 daily active viewers;
- 2,000 peak concurrent playback sessions;
- 100 playback starts per second burst;
- 300 sustained GraphQL operations per second;
- 134 baseline progress reports per second at a 15-second interval;
- fewer than 1,000 published titles;
- up to 20 home rail items per rail;
- up to 10 rails per response;
- dozens of full media-processing jobs per day.

## Availability classes

### Tier 1

- media delivery for active sessions;
- playback-session creation;
- published title read.

### Tier 2

- progress write;
- identity/profile;
- continue-watching.

### Tier 3

- search;
- computed home rails;
- processing administration.

Tier expresses user priority, not permission to ignore lower tiers.

## Consistency

| Data | Consistency |
|---|---|
| Rights status | strong at owner |
| Active publication | strong at owner |
| Playback eligibility | current trusted projection with safe rejection |
| Profile ownership | strong |
| Progress sequence | strong per profile/title |
| Watchlist mutation | strong/idempotent |
| Continue-watching | read-your-write target with bounded projection/cache delay |
| Search | eventual |
| Trending | eventual |
| Telemetry | best effort and sampled |

## Recovery objectives

Exact hosted objectives are selected in Phase 14.

Initial design intent:

- durable product data restored from PostgreSQL backups and event/projection procedures;
- active immutable media protected from accidental deletion;
- Redis rebuilt rather than restored as authority;
- event retention sufficient for projection recovery target;
- deployment rollback within the operational response window.

## Partition keys

- progress: profile ID plus title ID for aggregate, profile ID for query locality;
- watchlist: profile ID;
- title: title ID;
- events: aggregate ID when ordering is required;
- media objects: title and immutable publication ID;
- rate limiting: trusted identity and operation class.

## Uncertainty

Largest unknowns before real use:

- average delivered bitrate;
- geography;
- browser and device distribution;
- session duration;
- progress-report cadence tolerance;
- home/search traffic ratio;
- catalog growth;
- observability and egress cost;
- media encode time by source type.

Record actual values rather than retaining assumptions indefinitely.
