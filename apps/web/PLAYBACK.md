# Playable local demo

The anonymous playable demo is released locally through [Phase 07 acceptance](../../evidence/phase-07/release.md). Personalized player/library integration passes [local browser/Docker acceptance](../../evidence/phase-08/player-demo.md); protected release remains pending. No hosted deployment or cross-device certification is implied.

## Start

From the repository root, with Git and Docker Engine 26.0.0+/Compose 2.26.1+:

```bash
docker compose --project-name aster-demo --file infra/compose/compose.yml --file infra/compose/playable.yml --profile runtime up --build --wait --wait-timeout 180 web
```

Open <http://127.0.0.1:3000>, select **Signal / 02**, **Watch title**, then **Start playback**. Ports 3000, 4000 and 9001 must be free. The first build needs registry access, but no host Node, pnpm, FFmpeg, SQL commands, account or hosted credential. Use the exact `127.0.0.1` origin.

The explicit `web` target starts only the playback dependency chain. Identity/profiles, Redis, broker and observability are optional and are not started. An unavailable Profiles action does not block playback. The older `demo.yml` command remains a separate browsing/profile checkpoint.

The six-second 320×180 sample and English captions are generated from Aster's MIT-licensed technical recipe. They are not an approved third-party film or captions for one. Normal owner migrations, rights review, immutable object publication and current-approval session validation remain active. The narrowly scoped local initializer is described in [ADR-0029](../../docs/adr/0029-generated-playable-demo.md); it does not expose upload/operator authority to the viewer.

Successful initializers exit with code zero; application containers become healthy. Repeating the command verifies and reuses the generated files, objects and Catalog records without encoding again. Changed, incomplete, retired or conflicting data is rejected rather than overwritten.

Object replay checks presence and then streams the full retained bytes through size/SHA256 verification, without another upload. Only an explicit missing object permits one conditional creation; concurrent creation still requires matching readback. Unavailable storage, corruption or cancellation fails initialization without retries or replacement. Restore availability and inspect the exact seed logs; do not delete media to make initialization pass.

## Controls and boundaries

The watch page renders public metadata and mounts the client-only controls without loading media. An explicit start creates a short-lived session through Apollo, then attaches the media source. Media goes directly to the CDN-compatible object origin, never through Web, Router or Playback. Session creation has a four-second deadline and no automatic retry; an uncertain outcome requires an explicit new attempt.

Keyboard-accessible controls provide play/pause, seek, volume/mute, speed, fullscreen, caption selection and automatic/manual quality. Native HLS is a fallback where available; manual quality is not promised in that mode. Chromium is the currently measured browser, not proof of Safari, Firefox or every device.

Redux stores only bounded local preferences: volume, mute, speed, caption visibility and preferred quality. Corrupt or unavailable browser storage uses defaults. Sessions, media URLs and history are not persisted there. With HLS.js, hiding a caption track preserves already fetched cues so enabling it later works; this does not promise zero subtitle network requests while captions are off. Native tracks use their native loading behavior. Films without caption assets remain clearly unavailable rather than receiving invented captions.

HLS loads use bounded timeouts, retries, buffers and a stall deadline. Expiry, navigation and fatal failure cancel and dispose the player. A caption failure is reported without stopping otherwise playable video. No automatic fatal-recovery loop is used.

**Show local playback measurements** exposes at most 64 in-memory events. `atMs` is relative to explicit start; first-frame `durationMs` starts when the media adapter attaches. The first decoded frame is measured where supported, with a documented media-event fallback. The report has no title/session identifiers, media URLs, cookies or tokens and is not sent remotely. These local observations are not a production SLO or a host benchmark. Durable progress is separate and requires the opt-in below.

## Personalized demo

Use the same fresh `aster-demo` project, adding the existing event overlay and optional owners:

```bash
docker compose --project-name aster-demo --file infra/compose/compose.yml --file infra/compose/playable.yml --file infra/compose/events.yml --profile runtime up --build --wait --wait-timeout 180 web identity engagement broker-init
```

Open **Profiles**, **Start local session**, then create and select a fictional profile. Start Signal / 02 and pause around two seconds. Wait for **Progress saved**, then open **Your library**. Continue-watching offers resume; Viewing history retains completed entries. On the title page, **Manage watchlist** adds/removes membership; the library also supports removal. Another profile has separate state. This local assertion is not hosted authentication or an operator credential.

The player reports every fifteen seconds while playing and requests an earlier save on pause, completed seek or end. One request and one coalesced unsent sample are allowed, with at least two seconds between attempts. A pause during an active request preserves the final sample's flush priority. Only a matching `COMPLETED` response displays saved. An uncertain request permits at most two attempts with the identical key/payload; conflicts require fresh state rather than overwriting another tab.

Navigation/pagehide may attempt one bounded keepalive save. Browser termination can lose it; it is never presented as an acknowledgement. In-progress state resumes after metadata, clamped to actual duration. A late response offers an explicit resume control instead of jumping over already-started playback. Completed or unavailable state does not auto-resume. Optional read/save failure leaves media usable and displays an honest status.

Private Apollo state is scoped to profile/session lifetime, absent from public SSR and cleared on profile change, sign-out or expiry. Each library view replaces pages of at most twenty entries. Redux/localStorage still hold only local player preferences, never history or profile authority. Library requests select only displayed fields to stay within the unchanged owner cost budget. Watchlist retry is explicit and retains its exact intent; no offline queue exists.

The finite `broker-init` job exits zero after creating the three bounded topics. Delivery can lag during initialization/outage while accepted progress remains durable in PostgreSQL/outbox. This overlay does not add an external service account, paid resource or remote deployment. It is intended for a fresh demo, not an unreviewed upgrade of retained owner databases.

Inspect and stop **with all three files**, preserving named data:

```bash
docker compose --project-name aster-demo --file infra/compose/compose.yml --file infra/compose/playable.yml --file infra/compose/events.yml --profile runtime ps --all
docker compose --project-name aster-demo --file infra/compose/compose.yml --file infra/compose/playable.yml --file infra/compose/events.yml --profile runtime logs --tail 20 broker-init identity engagement
docker compose --project-name aster-demo --file infra/compose/compose.yml --file infra/compose/playable.yml --file infra/compose/events.yml --profile runtime down
```

To intentionally discard only this inspected disposable project, append `--volumes` to that exact `down` command. This irreversibly deletes its profiles, progress, audit/event state, keys and media. Never substitute the retained project's name or use a global prune. The older reset script is not a reset for this overlay.

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

Against a fresh personalized fixture, with no pre-existing profile collection:

```bash
ASTER_ENGAGEMENT_DEMO=true pnpm --filter @aster/web exec playwright test engagement.spec.ts
```

This journey creates only fictional profiles and verifies save/resume, completion/history, watchlist, keyboard focus, automated accessibility, profile isolation, save-transport failure with continuing media and sign-out. It refuses a retained profile collection. CI runs both modes in one existing affected-scope lane, waits for successful topic initialization, proves replay and cleans only its unique project. Local results and limitations belong to the Phase 08 evidence, not this command's presence.
