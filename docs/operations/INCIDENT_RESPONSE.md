# Incident Response

## Priorities

1. protect people, data, and content rights;
2. restore critical user journeys;
3. prevent cascading failure;
4. preserve evidence;
5. communicate facts and uncertainty;
6. correct systemic causes.

## Severity guide

### SEV-1

- widespread inability to browse or start playback;
- active unauthorized access;
- data corruption;
- widespread missing active media;
- rights-disputed content still actively promoted after notice;
- control-plane outage with no safe mitigation.

### SEV-2

- significant degradation;
- progress writes broadly failing;
- one major region or client class affected;
- large projection lag;
- repeated media-processing failures blocking publication.

### SEV-3

- limited feature degradation;
- noncritical rail failure;
- isolated title issue;
- operational warning with low immediate impact.

## Roles

- Incident commander: owns coordination and decisions.
- Operations lead: performs technical mitigation.
- Communications lead: records and communicates updates.
- Subject owner: provides context for the affected domain.
- Scribe: preserves timeline and evidence.

One person may hold multiple roles in a small team, but command remains explicit.

## Response loop

1. declare incident and severity;
2. identify affected user journey and start time;
3. stop risky deployment or change;
4. inspect SLI and deployment timeline;
5. narrow boundary with traces and dependency metrics;
6. choose safest reversible mitigation;
7. verify recovery through user outcome;
8. monitor for recurrence;
9. preserve evidence;
10. schedule review and corrective work.

## Safe mitigations

Depending on incident:

- rollback;
- disable optional rail;
- open or force a breaker;
- reduce concurrency;
- shed expensive operations;
- serve bounded stale public metadata;
- pause a consumer;
- retire an affected title;
- restore immutable media objects;
- scale a saturated stateless unit;
- fail over a managed dependency through approved process.

Avoid broad cache flushes, unbounded retries, or direct database edits without a reviewed reason.

## Communication

Updates contain:

- current impact;
- what is known;
- what is unknown;
- mitigation in progress;
- next decision point;
- no unsupported cause claim.

Use absolute timestamps and one time zone in the incident log.

## Recovery verification

- user journey succeeds;
- SLI returns to expected range;
- backlog drains without causing a second incident;
- error budget stops burning;
- data consistency checks pass;
- no unauthorized state remains;
- temporary controls are recorded.

## Review

Use `docs/templates/POSTMORTEM_TEMPLATE.md`.

Corrective actions should improve:

- prevention;
- detection;
- containment;
- recovery;
- documentation;
- decision quality.

Assign owners and verification, not vague reminders.
