# Public Web checkpoint

Status: public browsing, local profiles and Docker packaging implemented; Phase 05 remains IN_PROGRESS. Home, browse, localized title and attribution pages use the actual Apollo Router/Catalog. Profile creation/selection and sign-in/out use Identity through Router. Artwork, complete public adverse-state/performance acceptance and the player remain unfinished.

## Docker-only demo

Use the single command in the [root README](../../README.md#run-the-docker-web-demo). The explicit `demo.yml` overlay adds Web and runs the finite Catalog initializer with the fixed synthetic seed after migrations. The ordinary API-only runtime does not seed a catalog. Web builds from the frozen lock, ships traced Next standalone output plus static files, and needs no host dependencies or bind mount.

Web runs as UID/GID 1000 with a read-only root, dropped capabilities, one CPU, 512 MiB memory and 64 PIDs. Its only writable application path is the 32 MiB disposable image cache. It joins only the Router edge network; no private owner network, credentials or volumes are supplied. `/health/live` checks the Web process, not the health of Catalog or Identity. A ten-second orchestrator grace bounds shutdown.

The initializer reads the bundled, measured generated-media report (16 KiB input bound), validates explicit local/operator/seed activation, and has a 25-second migration-plus-seed deadline with cancellation. It reuses prior technical evidence instead of running FFmpeg at each startup. Existing title changes/takedowns are preserved: inspect `catalog-init` logs and resolve the specific conflict through Catalog, never delete PostgreSQL to repair startup.

Use `docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/demo.yml --profile runtime logs --tail 30 web catalog-init` for startup failures. Stop with the root README's all-profile command to retain data. The guarded local reset recognizes this exact overlay and Web cache mount; it still requires explicit destructive confirmation. Occupied loopback ports require stopping only the identified conflicting process/project. Linux/WSL amd64 is the current test platform; native Windows/macOS/arm64 portability is not yet proven.

## Run locally

Start the repository's Docker runtime as documented in the [root README](../../README.md#run-the-docker-federated-api-checkpoint). Use one Compose project; do not start another Router on occupied port 4000. With the pinned Node/pnpm and installed workspace dependencies, run from the repository root:

```bash
pnpm catalog:seed --project aster
pnpm --filter @aster/web build
pnpm --filter @aster/web start
```

Open <http://127.0.0.1:3000>. The start command copies generated static/public files into Next's standalone output and binds only loopback. `pnpm --filter @aster/web dev` is the development alternative. Do not run the host Web and Docker Web on the same port simultaneously.

The seed is opt-in. It runs the network-disabled generated HLS verifier, builds the Catalog initializer and publishes only `00000000-0000-4000-8000-000005000001` through Catalog create/review/media-ready/publish commands. Normal application SQL is unchanged. A repeated call is a no-op; a conflicting, changed or retired seed is refused, not overwritten. The initializer's extra authority only inserts the fixed technical attestation; it is never a Web or viewer endpoint. `--report evidence/phase-05/generated-media.json` can reuse the recorded local technical report while its recipe/image remains applicable. This trusted local operator input is not a cryptographically authenticated worker handoff.

“Signal / 01” is generated test content, not a licensed third-party film. Its `.invalid` media references are deliberately non-delivery references under [ADR-0016](../../docs/adr/0016-isolated-generated-media-fixture.md). No video bytes are served by Next. Retire the exact seed through the existing Catalog operator if removal is required; do not reset durable data.

## Rendering and boundaries

- `registerApolloClient` creates request-scoped preload clients. Public routes avoid a Suspense/loading fallback around critical Catalog content: React's streamed replacement otherwise requires JavaScript to reveal it. The bounded fetch completes before the public HTML shell is sent.
- Public operations are versioned in the Router inventory. A positive projection copies only selected public fields and bounded scalar/collection values; upstream cookies, extra fields and extensions do not enter Apollo hydration.
- The transport permits 256 KiB and four seconds, combines caller cancellation, rejects redirects and does not retry automatically.
- Server requests use Node HTTP because the pinned Node Fetch implementation discards an explicit Host header. This preserves Router's canonical public Host even when connecting to Compose DNS. Only fixed public headers are sent; browser cookies/identity headers are never forwarded. A process-local pool admits at most 16 requests with no application wait queue and four idle sockets; Apollo caches remain request-scoped. The browser still uses Fetch.
- Cache policies retain one page and one detail root, distinguish different cursors/IDs, and collect unreferenced entities after a consumer update. A populated 25-page test bounds the normalized title store to 21 entities; this is not a whole-process memory benchmark.
- Public links do not prefetch automatically. Locale is explicit (`en` or `pt-BR`), never inferred independently during hydration. Localized content carries its language tag.
- `ASTER_WEB_ROUTER_URL` is server-only and accepts only the documented loopback/Compose Router URLs. Web owns no database, session or operator credentials. Router accepts only the exact local Web/diagnostic origins under [ADR-0018](../../docs/adr/0018-local-web-session-boundary.md).

## Local profiles

Open Profiles in the header or `/profiles`, then start the local demonstration session. Create a fictional profile, choose language/maturity preferences and select it. This does not create a hosted account or implement password/email flows. Browser cookies are HTTP-only and SameSite Strict; Identity still validates the durable session for every operation.

The dialog loads on demand. Its separate Apollo client holds remote profiles, while a per-render-tree Redux store coordinates only the dialog, local step, busy state and finite notices. Input drafts stay in component state. Closing, session/profile changes, cross-tab invalidation and expiry cancel requests and discard the private cache. Expiry requires explicit recheck rather than an automatic refresh loop; a skewed browser clock cannot authorize a session. No Identity data is serialized into public SSR or persisted in browser storage.

Web source remains strict TypeScript. Its declaration-file-only compatibility exception for upstream RTK types is recorded in ADR-0018; other packages retain declaration checking.

## Verification

```bash
pnpm --filter @aster/web test
pnpm --filter @aster/web typecheck
pnpm --filter @aster/web exec playwright install chromium
pnpm --filter @aster/web test:browser
```

Browser checks require the production Web server and seeded Docker Router to be running, with no concurrent traffic to the test stack. They read Router logs to confirm one initial Browse operation. `ASTER_ROUTER_CONTAINER` selects a non-default local container (default `aster-router-1`); `ASTER_BROWSER_EXECUTABLE_PATH` optionally selects an existing Chrome executable. Tests cover public HTML/hydration, disabled/delayed JavaScript, keyboard/dialog focus, real local profile/cookie flows, cross-tab logout, browser-clock expiry, retry and negative origin checks. The profile test removes only its newly created fixture through Identity, preserving its audit. Use a dedicated test stack, not a concurrently used viewer session. [Evidence and remaining acceptance](../../evidence/phase-05/README.md).
