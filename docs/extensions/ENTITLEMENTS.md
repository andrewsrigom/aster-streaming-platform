# Extension: Subscriptions and Entitlements

## Status

Deferred. The initial catalog uses media that can be presented without paid access controls under verified terms.

## Product outcome

Support paid or restricted catalogs through explicit plans, subscription state, and playback entitlements.

## New bounded context

A dedicated Commerce and Entitlements context may be justified because billing truth, access policy, reconciliation, and provider webhooks have distinct ownership and security.

Do not place payment-provider logic inside Playback.

## Core model

- product and plan;
- customer mapping;
- subscription state;
- entitlement;
- effective time window;
- content package;
- provider event;
- reconciliation state;
- dispute and refund effect.

## Playback integration

Playback requests an entitlement decision:

```text
account/profile
+ title/package
+ current time
→ allow/deny with reason and decision expiry
```

The decision must fail closed when paid access cannot be verified. Short-lived cached allow decisions require revocation and expiry analysis.

## Reliability

- idempotent webhook handling;
- signature verification;
- out-of-order provider events;
- reconciliation job;
- entitlement projection;
- provider outage policy;
- audit;
- customer-support evidence.

## Rights and DRM

Restricted commercial content may require different rights, territory, window, and DRM behavior. That requires a separate media-rights model and delivery ADR. Do not apply those controls to existing Creative Commons assets without compatibility review.

## Security

- payment data remains with approved provider where possible;
- least-privilege provider credentials;
- webhook replay protection;
- no entitlement trust from client claims;
- audit every manual override;
- explicit refund and cancellation behavior.
