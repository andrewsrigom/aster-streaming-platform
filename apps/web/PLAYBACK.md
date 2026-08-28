# Playable local demo

Status: implemented; candidate acceptance and protected release are tracked in [Phase 07 evidence](../../evidence/phase-07/README.md). No hosted deployment or cross-device certification is implied.

## Start

From the repository root, with Git and Docker Engine 26.0.0+/Compose 2.26.1+:

```bash
docker compose --project-name aster-demo --file infra/compose/compose.yml --file infra/compose/playable.yml --profile runtime up --build --wait --wait-timeout 180 web
```

Open <http://127.0.0.1:3000>, select **Signal / 02**, **Watch title**, then **Start playback**. Ports 3000, 4000 and 9001 must be free. The first build needs registry access, but no host Node, pnpm, FFmpeg, SQL commands, account or hosted credential. Use the exact `127.0.0.1` origin.

The explicit `web` target starts only the playback dependency chain. Identity/profiles, Redis, broker and observability are optional and are not started. An unavailable Profiles action does not block playback. The older `demo.yml` command remains a separate browsing/profile checkpoint.

The six-second 320×180 sample and English captions are generated from Aster's MIT-licensed technical recipe. They are not an approved third-party film or captions for one. Normal owner migrations, rights review, immutable object publication and current-approval session validation remain active. The narrowly scoped local initializer is described in [ADR-0029](../../docs/adr/0029-generated-playable-demo.md); it does not expose upload/operator authority to the viewer.

Successful initializers exit with code zero; application containers become healthy. Repeating the command verifies and reuses the generated files, objects and Catalog records without encoding again. Changed, incomplete, retired or conflicting data is rejected rather than overwritten.

## Controls and boundaries

The watch page renders public metadata and mounts the client-only controls without loading media. An explicit start creates a short-lived session through Apollo, then attaches the media source. Media goes directly to the CDN-compatible object origin, never through Web, Router or Playback. Session creation has a four-second deadline and no automatic retry; an uncertain outcome requires an explicit new attempt.

Keyboard-accessible controls provide play/pause, seek, volume/mute, speed, fullscreen, caption selection and automatic/manual quality. Native HLS is a fallback where available; manual quality is not promised in that mode. Chromium is the currently measured browser, not proof of Safari, Firefox or every device.

Redux stores only bounded local preferences: volume, mute, speed, caption visibility and preferred quality. Corrupt or unavailable browser storage uses defaults. Sessions, media URLs and history are not persisted there. With HLS.js, hiding a caption track preserves already fetched cues so enabling it later works; this does not promise zero subtitle network requests while captions are off. Native tracks use their native loading behavior. Films without caption assets remain clearly unavailable rather than receiving invented captions.

HLS loads use bounded timeouts, retries, buffers and a stall deadline. Expiry, navigation and fatal failure cancel and dispose the player. A caption failure is reported without stopping otherwise playable video. No automatic fatal-recovery loop is used.

**Show local playback measurements** exposes at most 64 in-memory events. `atMs` is relative to explicit start; first-frame `durationMs` starts when the media adapter attaches. The first decoded frame is measured where supported, with a documented media-event fallback. The report has no title/session identifiers, media URLs, cookies or tokens and is not sent remotely. These local observations are not a production SLO or a host benchmark. Durable progress belongs to Phase 08.

## Inspect and stop

```bash
docker compose --project-name aster-demo --file infra/compose/compose.yml --file infra/compose/playable.yml --profile runtime ps --all
docker compose --project-name aster-demo --file infra/compose/compose.yml --file infra/compose/playable.yml --profile runtime logs --tail 30 playable-generate playable-seed catalog-init playback-init web
docker compose --project-name aster-demo --file infra/compose/compose.yml --file infra/compose/playable.yml --profile runtime down
```

`down` retains named data. For occupied ports, stop only the identified conflicting application/project. For `INITIALIZATION_REJECTED`, inspect the finite failure and retained state; do not overwrite the seed. For `ACCESS_RECOVERY_REQUIRED`, follow the fenced publication recovery in [Catalog's runbook](../../services/catalog/MEDIA_PUBLICATION.md), without deleting arbitrary locks or broadening access policy.

To intentionally discard this demo, first verify its exact project/containers/volumes. The following deletes **aster-demo's** generated media, database and session history irreversibly; generated fixture bytes can be recreated, but any additional data cannot:

```bash
docker compose --project-name aster-demo --file infra/compose/compose.yml --file infra/compose/playable.yml --profile runtime down --volumes
```

Do not substitute the retained development project's name. The older `reset-local-platform.sh` targets its fixed `aster` checkpoint, not this `aster-demo` project.

## Developer acceptance

The pinned developer toolchain can verify this running demo with:

```bash
ASTER_PLAYABLE_DEMO=true pnpm --filter @aster/web exec playwright test demo.spec.ts
```

Playwright/Chromium are development/CI requirements, not requirements for someone running the Docker demo. The test checks a real decoded HLS frame, captions enabled after starting with them off, accessible controls, redacted measurements, direct segment/caption delivery and denial of originals, private reports, listing and unapproved publication prefixes. The CI demo also repeats initialization to verify reuse. See the evidence index for actual results, image identities and limits.
