# Skill: Release and Operations

## Purpose

Move verified changes into service safely and make failures recoverable by someone who did not write the code.

## Environment progression

Use:

1. local;
2. integration;
3. preview when useful;
4. staging;
5. production.

Configuration changes follow the same review path as code.

## Release readiness

Before release verify:

- migrations and deployment order;
- compatibility between router, subgraphs, clients, and events;
- secrets and configuration;
- dashboards and alerts;
- capacity headroom;
- backup status;
- smoke tests;
- rollback or roll-forward path;
- current runbooks;
- release notes.

## Deployment

Prefer small, observable deployments. Use health checks that reflect actual service readiness. Keep rollback artifacts available.

A database migration that makes old code fail cannot be deployed before old instances are drained.

## Incident response

During an incident:

1. protect users and data;
2. establish incident command and communication;
3. identify the failing user journey;
4. use telemetry to narrow the boundary;
5. mitigate with the safest reversible action;
6. verify recovery against SLIs;
7. preserve evidence;
8. follow with corrective actions.

Do not make broad untested changes under pressure when traffic reduction, feature disablement, rollback, or dependency isolation is safer.

## Runbooks

A runbook includes:

- trigger;
- user impact;
- confirmation queries;
- immediate mitigation;
- diagnosis;
- recovery verification;
- rollback;
- escalation;
- follow-up evidence.

Every actionable alert links to a runbook.

## Postmortems

Use blameless, factual analysis. Separate triggering event, contributing conditions, detection, response, and systemic corrective actions.
