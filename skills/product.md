# Skill: Product and Domain

## Purpose

Translate product outcomes into precise behavior without turning implementation details into requirements.

## Product language

Use these canonical terms:

- account
- viewer profile
- catalog title
- edition
- media asset
- publication
- playback session
- playback progress
- watchlist entry
- viewing history
- home rail
- search result
- rights record

Do not create synonyms in code without updating `GLOSSARY.md`.

## Requirement method

A requirement should identify:

- actor;
- trigger;
- observable outcome;
- preconditions;
- authorization;
- invariant;
- failure behavior;
- acceptance evidence.

Use stable IDs such as `CAT-R03` or `P08-R06`.

## Scope discipline

Aster's core experience is browsing and watching verified films. Features that do not improve content acquisition, discovery, playback, engagement continuity, reliability, or operability require explicit prioritization.

Do not add social feeds, comments, chat, advertising, billing, or creator tooling to the core phases.

## Domain modeling

Model behavior around decisions, not database tables.

Examples:

- `PublishTitle` checks rights and media readiness.
- `RecordProgress` enforces ordering and idempotency.
- `CreatePlaybackSession` checks publication and availability.
- `BuildContinueWatching` applies resumability rules.
- `RemoveProfile` defines retention and ownership effects.

Use value objects for identifiers, time positions, durations, locale, rating, publication status, and license metadata when they carry rules.

## Acceptance quality

Prefer acceptance statements such as:

> Given a published title with a validated HLS master playlist, when an authorized viewer starts playback, then the service returns a short-lived playback session whose manifest reference is valid and auditable.

Avoid statements such as:

> Add an endpoint for playback.

The first defines behavior; the second prescribes a transport without defining correctness.

## Product documentation

Update:

- `docs/product/PRODUCT_REQUIREMENTS.md` for durable behavior;
- `docs/product/FEATURE_CATALOG.md` for scope and status;
- active phase specification for delivery;
- `GLOSSARY.md` for new canonical terms;
- an ADR only when a significant technical decision is involved.
