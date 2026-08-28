# Representative browser HLS acceptance

Source base `9a4656d`, branch `feat/p06-media-pipeline`, 2026-08-28. P06-R07 technical playback acceptance; Catalog still owns the published bundle. This is a local probe, not the Phase 07 product player.

## Result

[Raw browser output](browser-playback.json) reports six successful decoded-frame samples: 426×240 and 638×358 at 0.5, 298.5 and 594.5 seconds. `requestVideoFrameCallback` reported the matching dimensions and advancing presentation; decoded-frame counts increased. HLS.js reported no errors; browser error/warning logs were empty. The final frame was visually inspected. Browser duration was 596.583332 seconds, within the 0.2-second tolerance around the 596.5-second playlist duration.

One browser run used the existing bundle `3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d` at the read-only origin on 127.0.0.1:9001. The test page used the already allowed CORS origin 127.0.0.1:3000. No CORS policy was widened. The existing Web container was briefly stopped and its exact ID restarted in a `finally` block after the probe; the normal home page returned HTTP 200 with title “Aster — Stories, openly shared.” at 2026-08-28T07:10:05Z. All retained media, databases and serving images are unchanged. Attribution JSON returned 200 (4255 bytes).

## Reproduction and bounds

After frozen install, `pnpm media:probe 3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d` serves the probe on loopback port 3000, which must first be free. Open that page and click **Run acceptance** once. Restore the existing Web after closing the probe. Do not restart acquisition or encoding. For a container, append `--container` and publish only `127.0.0.1:3000:3000`; this explicit mode requires `/.dockerenv` and the same read-only repository/dependency mount.

The recorded execution used existing `aster-p06-tooling:git`, UID/GID 1002, 1 CPU/512 MiB/64 PIDs, read-only root/repository, no capabilities, no-new-privileges, 32 MiB tmpfs and the existing edge bridge. The temporary `aster-p06-hls-probe` container was stopped by exact identity after the result and automatically removed; no volumes were deleted. Node is 24.19.0 and pnpm 11.24.0. Browser surface: Codex In-app Browser on the shared Windows/WSL host.

The server accepts five exact GET/HEAD asset paths and the expected Host only, with bounded files/connections/headers/timeouts and a 15-minute maximum lifetime. It never reads/proxies media bytes. CSP permits media requests only to the local origin. The browser uses a 90-second overall deadline, 12-second sample deadlines, 10-second network loads with at most one retry, 18-second forward/6-second back buffer targets and a 6 MiB buffer-size target. Completion, cancellation and page exit stop network loading. TypeScript is checked strictly; pinned Node strips only this trusted probe source for the browser.

## Dependency decision

Root development-only [HLS.js 1.7.1](https://github.com/video-dev/hls.js/tree/v1.7.1) is the library already selected by the playback specification. [Upstream license/notices](https://github.com/video-dev/hls.js/blob/v1.7.1/LICENSE) remain available unmodified at `/HLS-LICENSE.txt`; Aster-authored code remains MIT. The browser bundle is self-contained, but its exported declarations import two missing type dependencies. A version-specific pnpm package extension supplies the upstream's exact `@svta/cml-cmcd` 2.4.0 (Apache-2.0) and `eventemitter3` 5.0.4 (MIT), without weakening TypeScript or patching library code. Registry integrity is retained in the lockfile; hls.js integrity is `sha512-DlzIkeBAS9IIQ432k3BUf3HlwbsR0+trB1i2lDdN2gUkNkrehFurh0/48M5c1/EjlDkdGng1gwZIpwyPxvdZ/g==`.

## Gates and limits

[Documentation/security closeout](browser-closeout.txt): 10/10 tasks, no cache, 7.48s. Initial review covered the probe's trust boundary, bounds and cancellation; confirmation covered the actual six-sample result, restored Web, notices and complete gates. No blocking finding remains in this slice.

[Full source gate](browser-source.txt): `pnpm check:source --concurrency=2`, 51/51 tasks, no cache, 1m49.398s. [Source fingerprints](browser-source.sha256) bind the exact implementation and dependency configuration to this result.

Focused server tests, strict types, lint and unused-code checks pass. The server test proves host/path/method/body rejection, CSP, stripped TypeScript, notices and no media proxy. [Initial source-gate output](browser-source-initial.txt) records container PID exhaustion from Turbo's default concurrency after the lockfile invalidated caches; the full gate is run with `--concurrency=2` and a 256-PID bound. This is verification scheduling, not a CPU benchmark or host diagnosis.

This result proves representative MSE playback and seeks in this browser, not every frame, audible sound quality, Safari/native HLS, adaptive bandwidth behavior, player accessibility or field SLOs. Those product checks remain Phase 07. The prior full decode, original/HLS/JPEG checksums and publication/S3 evidence remain supporting evidence because neither source, recipes, storage policy nor publication code changed. Storage-prefix orphan retention/cleanup and full Phase 06 release remain open.
