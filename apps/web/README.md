# Public Web checkpoint

Status: implemented public browsing slice; Phase 05 remains IN_PROGRESS. Home, browse, localized title and attribution pages use the actual Apollo Router/Catalog. No player, profile UI or complete Docker-only Web demo is claimed yet.

## Run locally

Start the repository's Docker runtime as documented in the [root README](../../README.md#run-the-docker-federated-api-checkpoint). Use one Compose project; do not start another Router on occupied port 4000. With the pinned Node/pnpm and installed workspace dependencies, run from the repository root:

```bash
pnpm catalog:seed --project aster
pnpm --filter @aster/web build
pnpm --filter @aster/web start
```

Open <http://127.0.0.1:3000>. The start command copies generated static/public files into Next's standalone output and binds only loopback. `pnpm --filter @aster/web dev` is the development alternative. Web Docker packaging remains Phase 05 work.

The seed is opt-in. It runs the network-disabled generated HLS verifier, builds the Catalog initializer and publishes only `00000000-0000-4000-8000-000005000001` through Catalog create/review/media-ready/publish commands. Normal application SQL is unchanged. A repeated call is a no-op; a conflicting, changed or retired seed is refused, not overwritten. The initializer's extra authority only inserts the fixed technical attestation; it is never a Web or viewer endpoint. `--report evidence/phase-05/generated-media.json` can reuse the recorded local technical report while its recipe/image remains applicable. This trusted local operator input is not a cryptographically authenticated worker handoff.

“Signal / 01” is generated test content, not a licensed third-party film. Its `.invalid` media references are deliberately non-delivery references under [ADR-0016](../../docs/adr/0016-isolated-generated-media-fixture.md). No video bytes are served by Next. Retire the exact seed through the existing Catalog operator if removal is required; do not reset durable data.

## Rendering and boundaries

- `registerApolloClient` creates request-scoped preload clients. Public routes avoid a Suspense/loading fallback around critical Catalog content: React's streamed replacement otherwise requires JavaScript to reveal it. The bounded fetch completes before the public HTML shell is sent.
- Public operations are versioned in the Router inventory. A positive projection copies only selected public fields and bounded scalar/collection values; upstream cookies, extra fields and extensions do not enter Apollo hydration.
- The transport permits 256 KiB and four seconds, combines caller cancellation, rejects redirects and does not retry automatically.
- Cache policies retain one page and one detail root, distinguish different cursors/IDs, and collect unreferenced entities after a consumer update. A populated 25-page test bounds the normalized title store to 21 entities; this is not a whole-process memory benchmark.
- Public links do not prefetch automatically. Locale is explicit (`en` or `pt-BR`), never inferred independently during hydration. Localized content carries its language tag.
- `ASTER_WEB_ROUTER_URL` is server-only and accepts only the documented loopback/Compose Router URLs. Web owns no database, session or operator credentials. Browser-origin/profile integration remains to be implemented with explicit CORS/CSRF acceptance.

## Verification

```bash
pnpm --filter @aster/web test
pnpm --filter @aster/web typecheck
pnpm --filter @aster/web exec playwright install chromium
pnpm --filter @aster/web test:browser
```

Browser checks require the production Web server and seeded Docker Router to be running, with no concurrent traffic to the test stack. They read Router logs to confirm one initial Browse operation. `ASTER_ROUTER_CONTAINER` selects a non-default local container (default `aster-router-1`); `ASTER_BROWSER_EXECUTABLE_PATH` optionally selects an existing Chrome executable. Tests cover actual public HTML, no duplicate hydration request, disabled/delayed JavaScript, locale and keyboard navigation. [Evidence and remaining acceptance](../../evidence/phase-05/README.md).
