# Project Charter

## Product statement

Aster is a video-on-demand service for openly licensed films. It provides a polished viewing experience while maintaining verifiable media rights, reliable playback continuity, and production-grade operational behavior.

## Problem

Open film projects often distribute high-quality work through separate pages and download archives. Aster organizes verified titles into a consistent catalog and makes them available through adaptive streaming, accessible playback, search, profiles, watchlists, and cross-device progress.

The engineering problem is broader than rendering a catalog. A useful service must ingest and validate source media, package it safely, publish it atomically, serve control-plane APIs under failure, protect GraphQL resources, and expose enough telemetry to understand user experience.

## Objectives

1. Deliver a coherent VOD experience from catalog discovery through playback completion.
2. Make content rights and attribution enforceable product data.
3. Demonstrate clear domain ownership through a federated API.
4. Keep Node.js request paths responsive and resource-bounded.
5. use Redis for explicit cache and coordination patterns with safe degradation.
6. Make failures controlled through deadlines, retries, breakers, limits, and fallbacks.
7. Define and measure user-facing reliability.
8. Provide a practical reference implementation whose decisions can be reproduced from documentation and evidence.
9. Support local development with commodity hardware and a containerized dependency stack.
10. Describe a credible evolution path without pretending the initial deployment has extreme scale.

## Success criteria

The initial release is successful when:

- a viewer can browse, search, open, and play published films;
- playback adapts between multiple HLS renditions;
- captions and keyboard-accessible controls are available;
- progress is saved monotonically and resumed correctly;
- the home page remains useful when optional discovery dependencies fail;
- media cannot publish without a verified rights record and validated package;
- GraphQL operations are composed, authorized, cost-bounded, and measured;
- cache failure degrades latency or personalization but does not corrupt truth;
- key user journeys have SLIs, SLOs, dashboards, alerts, and runbooks;
- load and failure evidence meets Phase 14 release gates;
- repository state can be restored from documentation alone.

## Constraints

- The core implementation uses TypeScript and Node.js.
- The web application uses Next.js.
- The application API uses Apollo Federation v2.
- PostgreSQL is the durable authority.
- Redis is non-authoritative.
- Media delivery uses HLS, object storage, and CDN-compatible URLs.
- Only verified and appropriately licensed content may be published.
- Local development must not require paid services.
- Scope advances through the ordered phase specifications.

## Non-goals for the initial release

- digital rights management;
- paid subscriptions;
- advertising;
- creator uploads from untrusted public users;
- user-generated comments or social feeds;
- live broadcasting;
- automated editorial recommendation models;
- offline downloads;
- native mobile or television applications;
- multi-region active-active writes.

Optional designs exist for later evolution, but they are not part of the initial release.

## Stakeholders

- viewers;
- content and rights operator;
- platform operator;
- application engineers;
- incident responders;
- maintainers of the public repository.

## Governance

Architecture changes use ADRs. Product changes update product requirements and phase specifications. Measured claims use experiment records. Operational changes update runbooks in the same change.
