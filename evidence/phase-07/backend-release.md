# Playback backend release

P07-R01/R02/R03/R09 backend slice is released through protected main; the full player/demo phase remains IN_PROGRESS.

- [PR 24](https://github.com/andrewsrigom/aster-streaming-platform/pull/24) final head: 7eb121c89bd795d86869c11ed8df2fd914839c6e.
- [Protected CI 33163548411](https://github.com/andrewsrigom/aster-streaming-platform/actions/runs/33163548411): all six jobs pass, including actual Playback persistence/federated runtime.
- [Confirmation 5451448968](https://github.com/andrewsrigom/aster-streaming-platform/pull/24#issuecomment-5451448968) explicitly reviews 7eb121c89b without major findings. The initial startup thread is resolved; [correction proofs](backend-review.md) pass.
- Squash: f2d99d254263baac532ef36edba0ab2c99d20dc3.
- [Exact post-merge CI 33164139588](https://github.com/andrewsrigom/aster-streaming-platform/actions/runs/33164139588): five applicable jobs pass; dependency review correctly skips push. CI required 98826950937 succeeds.

Local feat/p07-player is rebased on that squash; its backend tree is identical to the reviewed head. Full Phase 00–14 goal remains active. No additional backend review or repeated unchanged experiment is needed.

## Local application upgrade for player acceptance

2026-08-28: the retained project aster-p04-development uses the tested backend images from the corrected real runtime proof. Catalog 0008 and Playback 0001 applied with normal bounded initializers. Existing trust files were validated, not rotated; two Playback trust volumes were added. Only Catalog, Playback, Router and Web were started/recreated with --no-deps. All four are healthy. PostgreSQL, Redis, media origin/writer, film objects and publication pointer remain intact.

Before migration, a Catalog-only custom-format backup was preserved outside the public repository: 61626 bytes, SHA-256 a5b6bf25a65759fe8f60598b53f138a0ff44659589bc09dd0ce346918375be9e. Previous Web/Router/Catalog images have local aster-p07-rollback tags. Roll back application images if necessary; retain additive schema/audit and all media, never run destructive down against this database.

The first player image dbb85985b084d8206064f7925c2ee30bfe177f28c66584eeae6697e30258c068 builds and starts. Its public asset scan has zero findings; 76 dependency packages/208 notice artifacts include actual HLS.js 1.7.1, Media Chrome 4.19.2 and ce-la-react 0.3.2 licenses. An initial in-app browser journey created a real session, decoded the retained film, switched automatically 240p to 358p, supported explicit quality/seek/mute/rate/fullscreen and restored preferences after reload. First-frame sample was 447ms from the explicit session action (291ms from adapter attachment); one sample is not a performance benchmark or SLO. Focus/caption-control refinements and formal browser/failure/clean-demo evidence remain open.
