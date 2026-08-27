# Phase 04 Evidence Index

Phase status: RELEASED through PR 21 at main `b6c99c4`. All ten requirements have local acceptance, exact-head protected CI, squash and successful post-merge CI. [Release evidence](release.txt).

- [Composition checkpoint](composition.txt): deterministic owner schema printers, five artifacts, twelve known operations, compatibility against committed baselines and negative tests.
- [Router runtime checkpoint](router-runtime.txt): Docker-only session journey, private owner credentials, forged/duplicate headers, partial timeout, concurrency, revocation, cancellation, Collector outage and graceful stop/recovery.
- [Actual query plan](router-query-plan.json) and [Collector trace](router-trace.txt): two-owner fetches, bounded operation attributes and private-canary checks.
- [Author review and confirmation](router-review.txt): blocking boundaries, batched corrections and remaining release gates.
- [Clean-source acceptance](clean-acceptance.txt): deterministic test remediation, complete 55/55 gate, fresh-data Docker build/journey/failure proof, guarded cleanup and the moderate dependency-advisory disposition.
- [Supergraph](../../infra/router/generated/supergraph.graphql), [public API](../../infra/router/generated/api.graphql), [ownership/hash manifest](../../infra/router/generated/manifest.json).
- [Commands, bounds and conventions](../../apps/router/README.md).
- Predecessor: [Phase 03 release](../phase-03/release.txt), PR 20 squash `1354841`, protected and post-merge CI passed.

| Requirements | Current implementation/evidence |
|---|---|
| P04-R01/R05/R08/R10 | Generated schemas/manifest, composition/baseline/known-operation tests and documented update/check commands |
| P04-R02/R03 | Private Compose owners, per-owner credential adapters and real public/private/session negative probes |
| P04-R04 | Router README conventions, nullable mixed query and sanitized public errors |
| P04-R06 | Real Router operation/fetch events, query plan, Collector trace and authenticated owner correlation |
| P04-R07/R09 | Bounded HTTP/parser/fetch/admission settings, real timeout/partial failure, cancellation and recovery |

No hosted readiness, approved real film or playable demo is claimed. Accessibility/browser interaction is not applicable to this HTTP-only phase; Phase 05 owns the web shell. Its deterministic generated-publication prerequisite is inspected in the clean acceptance record; its default-data UI seed remains explicit Phase 05 work.
