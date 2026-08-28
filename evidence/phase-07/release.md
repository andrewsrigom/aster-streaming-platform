# Phase 07 release

2026-08-28: [PR 25](https://github.com/andrewsrigom/aster-streaming-platform/pull/25) head c7f9f7c0e5ad14134fe260284fe7c1f8f2921efe passed [protected CI 33170527302](https://github.com/andrewsrigom/aster-streaming-platform/actions/runs/33170527302) and [one confirmation](https://github.com/andrewsrigom/aster-streaming-platform/pull/25#issuecomment-5452439397). Both initial P2 findings were resolved in one correction commit. Squash 854592e5ff1213a306b45d61a547ad4f2a2d9395 passed [exact post-merge CI 33171284170](https://github.com/andrewsrigom/aster-streaming-platform/actions/runs/33171284170). [Raw check states](release-checks.json). This is the documented local release, not hosted deployment.

## Acceptance

| Requirement | Implementation and evidence |
|---|---|
| P07-R01 | Current Catalog authority, rights failures and private owner boundary: [backend](README.md), [non-delivery correction](player-review.md) |
| P07-R02 | Rights-capped expiry, durable audit, no storage credentials: [backend release](backend-release.md) |
| P07-R03 | CDN-compatible reference and browser-to-origin bytes: [player network proof](player.md) |
| P07-R04 | HLS.js adaptation/lifecycle and unit-tested native branch: [player](player.md) |
| P07-R05 | Keyboard play/pause/seek/mute/volume/rate/fullscreen/captions/quality: [control acceptance](player.md) |
| P07-R06 | Bounded versioned preferences, post-hydration storage and reload: [player](player.md) |
| P07-R07 | Finite session/manifest/network/decode/support/caption/fatal UI and teardown: [player](player.md) |
| P07-R08 | Bounded redacted session/manifest/frame/switch/stall/fatal/completion events and actual local samples: [QoE](player.md) |
| P07-R09 | Anonymous playback independent of optional owners: [real base-graph proof](backend-review.md) |
| P07-R10 | Rights/expiry/missing media/throttling/ABR/caption/keyboard adverse behavior: [backend](README.md), [browser](player.md) |
| P07-R11 | Compatibility, ownership, licenses, accessibility and supported matrix: [ADR-0028](../../docs/adr/0028-player-controls.md), [limitations](player.md) |
| P07-R12 | Docker-only fresh initialization, real captioned frame, private denial, replay and scoped cleanup: [demo proof](player.md), [command/runbook](../../apps/web/PLAYBACK.md), protected and post-merge fresh-run gates above |

Chromium/Windows is the measured browser. Native fallback has unit coverage, not a Safari/iOS certification; Firefox and actual OS-reader speech are not measured. The retained film has no approved captions/audio description; the generated sample provides labeled technical captions. Timings and the single scoped resource sample are laboratory observations, not field SLOs or host-health claims. These limitations were explicit at review, not hidden test exclusions.

Retained Web f29a1ebe and Catalog 4429f8e0 are healthy with real affected browser acceptance; existing database, film and origin remain intact. [Rollback and image identities](player-review.md). The Phase 08 branch was rebased from the frozen candidate onto its identical squash tree; recovery stash 0a477fb62adef5b74dbf4084cf47b3e491bd6e3b is already restored, not pending.

Phase 08 prerequisites are available: durable Playback sessions, owned Identity profiles, stable Catalog entities, and the verified broker adapter with durable Identity/Catalog outboxes. Engagement's first domain/application checkpoint is [implemented](../phase-08/README.md); actual persistence, owner adapters and player save remain planned. Full Phase 00–14 work continues.
