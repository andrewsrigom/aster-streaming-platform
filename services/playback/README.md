# Playback sessions

Phase 07 is released locally: owner-authorized sessions, player, preferences, experience telemetry and the Docker-only generated playable demo. [Release evidence](../../evidence/phase-07/release.md). No media bytes pass through this service.

## Public contract

Use the existing Router at `http://127.0.0.1:4000/graphql`, with its exact Origin/CSRF policy. The protected compatibility operation is:

```graphql
mutation StartPlayback($titleId: ID!) {
  createPlaybackSession(titleId: $titleId) {
    code
    correlationId
    session { id titleId manifestUrl expiresAt }
  }
}
```

Only `COMPLETED` returns a session. `NOT_PLAYABLE` covers absent or currently ineligible publications. `UNAVAILABLE`, `CANCELLED`, `INDETERMINATE`, `LIMIT_EXCEEDED` and `INVALID_INPUT` are non-success outcomes; transport errors are also possible. Never retry a session mutation automatically after an uncertain response. A later explicit user action may create a different session. The API has no caller-supplied profile, manifest, approval or session ID.

Sessions are anonymous, have a maximum fifteen-minute lifetime and expire no later than current title/artwork rights. `expiresAt` is UTC epoch seconds (GraphQL Float, not a 32-bit Int). IDs and correlation IDs are audit identity, not storage credentials. Session expiry does not revoke already-delivered openly licensed URLs. A new session rechecks Catalog; there is no cross-request authorization cache or dependency on Identity, Redis, Engagement or Discovery. [Trust and consistency decision](../../docs/adr/0027-local-playback-sessions.md).

## Runtime

The normal [Docker API checkpoint](../../README.md#run-the-docker-federated-api-checkpoint) builds Playback, applies additive migration 0001 and starts its private listener on 3300. An empty Catalog can be healthy but returns no playable session. That API command does not acquire a film or start Web; use the root playable-demo command for the released player.

Two independent 256-bit credentials are required: Router-to-Playback at `/run/aster-router/playback.key`, and Playback-to-Catalog at `/run/aster-playback-catalog/catalog.key`. Only the latter is shared with Catalog; Router never mounts it. The finite initializer creates private files, and consumers reject missing/insecure files. Never print credentials. Rotate only their exact disposable volumes after stopping all affected consumers; retain PostgreSQL and media.

Deadlines nest as follows: private Catalog HTTP 1500 ms; session application 2000 ms; Playback GraphQL 2500 ms; Router Playback fetch 2700 ms; public Router 3000 ms. Engagement's separate progress fetch also uses 2700 ms; other owner fetches retain 2000 ms. The [Router's per-subgraph configuration](https://www.apollographql.com/docs/graphos/routing/performance/traffic-shaping) permits this bounded override. The fixed, read-only Catalog client is the sole synchronous retry owner: it may make one additional attempt after only a selected transient 502/503/504, `EAI_AGAIN`, `ECONNRESET` or incomplete stream, with a 650 ms attempt ceiling and 13–25 ms equal-jitter delay inside the same 1500 ms deadline and logical concurrency permit. Attempt timeout, permanent/malformed response, Router fetch and every mutation receive no automatic retry. [ADR-0040](../../docs/adr/0040-deadline-bound-safe-read-retries.md) defines the complete classification and budget.

The complete logical read passes through its own process-local `catalog/playback_publication` breaker: 30-second window, four minimum samples, 50% failures, five-second open state and one half-open probe. A Catalog completion counts as success only after the publication identity, version, freshness, rights expiry and delivery URL pass the same domain validation used by session creation; malformed, stale or mismatched owner data counts as a breaker failure. Open/probe contention makes no Catalog request and remains unavailable; it never authorizes a session from stale state. Result and transition metrics use finite dimensions. [ADR-0041](../../docs/adr/0041-operation-scoped-circuit-breakers.md) defines state, recovery and restart behavior.

Playback admits at most four concurrent GraphQL operations, with 32 burst credits refilling at four/second. Bodies are limited to 16 KiB, GraphQL source to 4 KiB, one mutation root, 16 fields, depth three, four aliases and cost 80. PostgreSQL has four connections and a one-second operation budget. `/health/ready` requires the restricted store and current Catalog read; `/health/live` remains independent of dependency availability. Shutdown drains/cancels work within ten seconds; Compose allows fifteen seconds.

Phase 08 adds one private, read-only session/title inspection for Engagement. Compose enables ASTER_PLAYBACK_ENGAGEMENT_READ_ENABLED with a distinct /run/aster-engagement-playback/playback.key. It returns bounded timing/context, never a media URL, and cannot issue a session or act as Router. Its one-request/no-queue admission and independent rate bucket cannot consume public session permits/rate credits or all four SQL connections. Playback readiness and anonymous session creation do not depend on Engagement. [Progress trust](../../docs/adr/0030-local-engagement-progress.md).

## Verification and recovery

After frozen installation, `pnpm playback:integration` tests real PostgreSQL migrations, capacity, expiry, role isolation and readiness. `pnpm playback:runtime` builds the images and tests Router → Playback → Catalog plus durable session writes in a UUID-named Docker fixture. It deliberately omits optional owners and uses synthetic metadata with no media fetch. It checks current retirement, rights caps, spoofed authority, fan-out, blocked dependencies, recovery and shared trace correlation. It validates ownership before removing only its own containers, private trust volumes and tmpfs database. Images/build cache remain; retained projects are untouched.

Inspect a normal stack using `docker compose --project-name aster --file infra/compose/compose.yml ps --all` and `docker compose --project-name aster --file infra/compose/compose.yml logs --no-color playback playback-init catalog router`. Logs expose finite outcomes/correlation, not full documents, credentials or manifest URLs. Correlated logs are not a claim of exported application spans or a dashboard.

Roll back by restoring compatible prior Router artifacts and stopping Playback. Keep its additive schema/session audit and all Catalog/media data. The [migration policy](migrations/README.md) explains 4096 SQL slots, 24-hour post-expiry audit retention, bounded pruning and why destructive down is restricted to disposable or separately authorized recovery targets.
