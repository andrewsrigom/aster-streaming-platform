# Personalized playable demo acceptance

P08-R11, 2026-08-28. Candidate based on main7fe10ed9251c5e2c9d6f08d32ce3d93a29f627cc, with implementation checkpoint533368d5b163d32f6ba008ad410c19c17110c350 and the corrections identified by [exact source hashes](player-demo-source.sha256). Local acceptance and the [refreshed candidate gate](player-demo-candidate.txt) pass: 70/70 tasks, 45 cached, 1m54.807s, exact-main composition and all31 source hashes. Protected CI/review and release remain pending.

## Story and environment

A fictional owned profile watches generated Signal / 02 through Web → Router → owner services/PostgreSQL, saves, resumes and manages its library. Video travels directly from the object origin. No mocked owner, fabricated save, new film acquisition or retained database migration is involved.

Fresh project aster-p08-demo-20260828 began with zero labelled containers, volumes or networks. The resolved model has21 services,13 project-prefixed named volumes, no external volumes or host binds. Docker built the pinned Linux images serially from the frozen lockfile. Web's final image is sha256:771f9cb138d5634d98cd41fb9ae09fd49bf2baa88a381e1459056b0cda1aaf74. Runtime uses Node24.19.0; source checks use native WSL Node24.19.0/pnpm11.24.0 with a1536-MiB heap. Browser execution used Windows Node20.11.1 only to run pinned Playwright1.62.1/axe4.13.0 against installed Chrome152.0.7977.64 in a new isolated context. Cached build layers are not a cold-download measurement.

Only retained Web/Router/origin were temporarily stopped to free their fixed localhost ports. Their exact container IDs were checked, then restored in the supervisor's finally block. Retained database, media, keys and unrelated projects were never removed. After success, ownership-checked cleanup deleted only this disposable project's21 containers,13 volumes and two networks; queries confirmed zero remaining labelled resources. The retained health endpoint returned200.

## Commands and results

From the repository root, with the exact project above:

```bash
docker compose --parallel 1 --project-name aster-p08-demo-20260828 --file infra/compose/compose.yml --file infra/compose/playable.yml --file infra/compose/events.yml --profile runtime build
docker compose --project-name aster-p08-demo-20260828 --file infra/compose/compose.yml --file infra/compose/playable.yml --profile runtime up --build --wait --wait-timeout 180 web
ASTER_PLAYABLE_DEMO=true pnpm --filter @aster/web exec playwright test demo.spec.ts
docker compose --project-name aster-p08-demo-20260828 --file infra/compose/compose.yml --file infra/compose/playable.yml --file infra/compose/events.yml --profile runtime up --no-build --wait --wait-timeout 180 web identity engagement broker-init
ASTER_ENGAGEMENT_DEMO=true pnpm --filter @aster/web exec playwright test engagement.spec.ts
docker compose --project-name aster-p08-demo-20260828 --file infra/compose/compose.yml --file infra/compose/playable.yml --file infra/compose/events.yml --profile runtime up --no-build --wait --wait-timeout 90 web identity engagement broker-init
```

The local Windows browser runner executed the identical hashed test/config via `node ../node_modules/@playwright/test/cli.js test --config playwright.config.ts engagement.spec.ts --global-timeout=120000`; it used `ASTER_BROWSER_EXECUTABLE_PATH` for Chrome. Topic initialization was separately awaited by exact container ID and required exit0 before the browser and after replay. The CI lane expresses the same flow with the pinned pnpm runner and a120-second topic wait. It retains the original anonymous proof and runs personalization in the same project/lane, not another duplicated pipeline.

[Browser observations](player-demo-browser.json) preserve test status, timings and decoded JSON attachments, excluding host-path configuration. Anonymous:1/1,5124ms; actual HLS frame, captions, direct origin, private/listing denial and zero axe violations. Axe still marks color contrast and video captions as requiring manual judgment; separate caption behavior is explicitly asserted. Personalized:1/1,23559ms,zero retries/skips; actual resume seek exactly2seconds, completion absent from continue-watching but retained in history, watchlist add/remove, keyboard focus, zero axe violations, profile isolation, injected save-transport failure with continuing playback, sign-out clearing and no browser exceptions. [Resumed frame](resumed-player.png) shows the generated video and saved status. This is an assertion/event record plus screenshot, not a full screen-reader or cross-browser certification.

[Supervisor output](player-demo-runtime.txt) records the successful corrected browser run, healthy applications, successful finite jobs, generated_hls_reused, Catalog changed:false, topic replay, exact cleanup and retained-container restoration. The original anonymous pass precedes the player fixes; unchanged anonymous media/caption/origin behavior is carried forward. The corrected personalized run reused the isolated fixture and deleted only each failed run's exact fictional profile through Identity, preserving owner audit/deletion fences. Protected CI must still prove the final source from empty project data.

## Findings and corrections

- First browser attempt saved2000ms but ContinueWatching(first:20) was rejected by the owner cost budget. Removed unused sequence/version/updatedAt from library documents only. Page size20, player sequence, public schema and budget384 remain unchanged. Nine library tests and11 owner tests pass, including a real-inventory cost regression that rejects the prior overfetch.
- A pause/seek during an active save lost its flush priority and waited for the periodic timer. A latched flush now survives the in-flight command and its identical retry, without another concurrent request or a tighter rate. Two deterministic regressions failed before the fix;26 player/media/lifecycle tests pass afterward. No test timeout was relaxed.
- Watchlist refetch now restores focus to its stable status; library removal restores its heading. The browser presses Enter and asserts both focus destinations.
- Playwright output now explicitly belongs to the Web test-results directory. This prevents default nearest-package output cleanup from selecting an unrelated parent directory.
- One later bootstrap attempt and its diagnostic returned Playable seed upload unavailable while reusing existing immutable objects. A finite transport diagnostic subsequently observed nine expected412 conditional conflicts and successful readback/approval; normal startup and replay then passed without a storage-code change. The failed observations are not rewritten as success or attributed to CPU. Current evidence proves recovery/preservation, not the unavailable transport's root cause. If fresh CI reproduces a startup/replay failure, it blocks publication and requires that specific diagnosis; no automatic retry loop is added.

The actual source edits are limited to the active player/library/CI boundaries; no SQL, event signing, media recipe or owner runtime change invalidates prior Phase08 SQL/Kafka proofs. Runtime, composition and cost gates still apply. Review stopping rule remains one initial plus one confirmation round, extended only for blocking requirements, data/security, availability or public contracts.

## Recovery

Stop the optional personalized services or restore compatible prior Web/Router images. Retain owner data, pending facts, deletion fences and signing keys. Never reset the retained development project to recover a demo test. The fresh fixture was intentionally removed after success and is reproducible from the documented command; its fictional user data is not recoverable or needed.
