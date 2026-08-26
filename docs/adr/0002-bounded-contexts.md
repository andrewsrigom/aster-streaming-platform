# ADR-0002: Use Five Primary Bounded Contexts

- Status: Accepted
- Date: 2026-08-25
- Related requirements: IDP-R01–R05, CAT-R01–R07, PBK-R01–R06, ENG-R01–R06, DSC-R01–R05

## Context

The product includes identity, editorial catalog state, media playback authorization, viewer engagement, and discovery. Combining them creates ambiguous ownership; splitting by technical layer creates services without business cohesion.

## Decision

Use:

1. Identity and Profiles
2. Catalog
3. Playback
4. Engagement
5. Discovery

Media processing is a separate worker capability governed by Catalog requests and results.

Each context owns its model and writes. Cross-context integration uses Federation, versioned events, and explicit read projections.

## Consequences

### Positive

- Clear language and data ownership.
- Independent failure and scaling reasoning.
- Federation fields map to product responsibilities.
- Engagement can evolve without changing title truth.

### Negative

- Cross-context journeys require network or event contracts.
- Entity extensions and projections add operational work.
- Some initially small contexts still require deployable discipline.

## Alternatives considered

### Service per database table

Rejected because tables are not business boundaries.

### One catalog-and-playback context

Rejected because editorial publication and per-session delivery have different security, scaling, and failure behavior.

### Merge Engagement and Discovery

Rejected because durable viewer state and derived ranking have different authority and consistency.

## Revisit triggers

A context can split or merge only through a new ADR backed by observed coupling, ownership, scale, or reliability evidence.
