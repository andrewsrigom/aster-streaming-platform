# Discovery search and home rails

Phase 09 search, independent home rails, Web integration and bounded product
metrics are released. Phase 10 released a bounded optional home cache over the
same rebuildable PostgreSQL projection. Catalog remains the
authority for title metadata, publication and rights; Discovery returns federated
`Title` references so current public metadata is resolved by Catalog.

## Public contract

Use the `SearchTitles` known operation through Router at `http://127.0.0.1:4000/graphql`:

```graphql
query SearchTitles($query: String!, $locale: String!, $first: Int! = 20, $after: String) {
  searchTitles(query: $query, locale: $locale, first: $first, after: $after) {
    code
    correlationId
    connection {
      generation
      edges {
        cursor
        sourceVersion
        indexedAt
        visibleUntil
        node { id localized(locale: $locale) { locale title } }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
}
```

Query and indexed text use the same Unicode, punctuation and whitespace normalization. Input is 1–80 code points, at most eight terms; locale is canonical and page size is 1–20. Results use weighted PostgreSQL full-text rank descending and title ID ascending. The opaque `s1` keyset cursor is bound to the canonical query, locale and active projection generation. A cursor from another query or generation is rejected. Live updates can change later pages; restarting without a cursor begins a fresh traversal.

`COMPLETED` returns a connection, including an explicit empty result. `STALE`, `CURSOR_EXPIRED`, `INVALID_INPUT`, `UNAVAILABLE`, `CANCELLED` and `INDETERMINATE` return no connection. A title entity can become null if Catalog retires it after the projection read; this preserves the rest of the search page instead of nulling the whole connection. Search never grants playback access.

## Home rails

`HomePublic` requests `homeRails(first: 1–12)`. It returns featured, recently
added, curated trending and at most three genre groups. Each group has its own
code, source, oldest indexed time and earliest visibility expiry. Featured and
curated trending use the matching Catalog editorial label; trending is not a
behavioral-popularity claim. Genre order is count descending then slug, while
title order is publication time descending then title ID.

The four selections use independent read-only transactions. If featured or
trending is empty or unavailable and recent completed with titles, that group is
returned as `FALLBACK` with source `RECENTLY_ADDED`. A genre failure does not erase
fixed rails. An expired projection returns `STALE`; it never fabricates empty
success. `HomePersonalized` combines the public root with nullable
Engagement-owned `homeContinueWatching`. If Engagement is unavailable, Router can
retain public rails with a partial GraphQL response; Discovery stores no profile
or progress data.

When `ASTER_DISCOVERY_CACHE_ENABLED=true`, `HomePublic` uses the whole-page cache
from [ADR-0038](../../docs/adr/0038-bounded-discovery-home-stale-cache.md). A
fresh hit skips the four PostgreSQL selections. A page can remain eligible as
stale for at most sixty seconds from capture and never reaches any title's
`visibleUntil`. Eligible stale data returns `STALE` with rails plus a visible Web
refresh notice while one bounded background refresh runs. Projection stale with
no eligible cache page returns the existing null-field `STALE` response. Redis
loss runs the normal PostgreSQL source and cannot affect Catalog or Playback.
Refresh uses the shared recoverable two-second lease, so wrong-type,
non-expiring or longer-lived contaminated keys are replaced atomically rather
than suppressing coordination for their retained lifetime.

## Projection and recovery

Catalog v1 publication events are bounded invalidation hints. For each accepted hint, Discovery fetches one current snapshot through its purpose-separated private Catalog operation before writing. That fixed safe read is the sole synchronous retry owner and may make one additional attempt only after a selected transient 502/503/504, `EAI_AGAIN`, `ECONNRESET` or incomplete stream. Both attempts retain the one-operation/no-queue lane and 2,000 ms overall deadline; attempt timeout, permanent/malformed response, Router traffic and writes do not retry. [ADR-0040](../../docs/adr/0040-deadline-bound-safe-read-retries.md) defines the exact 850 ms attempt, response reserve and equal-jitter policy. Older versions cannot replace newer state, same-version conflicts fail closed, and retirement or rights-expiry fences cannot be resurrected by replay.

Snapshot refresh and rebuild export use independent process-local Catalog breakers with the same 30-second/four-sample/50% policy, five-second open interval and one half-open probe. A response counts as success only after every snapshot passes the complete domain shape, freshness, lease and requested/ordered identity checks; malformed, stale or mismatched owner data counts as failure in its exact operation scope. An open snapshot circuit does not block export or Playback. Rejection adds no queue and creates no data; only an already valid active projection may remain serviceable under its existing lease. Finite result/transition metrics identify the fixed operation class. [ADR-0041](../../docs/adr/0041-operation-scoped-circuit-breakers.md) defines the state machine.

The active projection stores source version, event provenance, indexed time and a five-minute visibility lease capped by Catalog rights expiry. Expired public rows produce `STALE`, not a fabricated empty success. Consumer progress is stored in the same Discovery transaction before broker acknowledgement. Invalid bounded records enter a finite quarantine; oversized records and full quarantine remain uncommitted.

A rebuild captures one broker high-water barrier, scans current Catalog snapshots in bounded UUID-keyset pages, applies concurrent events to both active and building generations, waits for durable consumer catch-up and then atomically promotes the building generation. An absent checkpoint covers only broker position zero. The maintenance runtime starts a new generation when the active generation reaches half of its five-minute lease. The prior active generation remains serviceable during maintenance until its lease expires; bootstrap and expired generations remain unavailable. Failed or partial rebuilds never replace the active generation. Durable cursor, barrier and source-version fences allow restart without depending on broker retention. At most the active and one building generation are retained.

## Runtime and failure boundaries

Discovery listens privately on 3500. The API login can read the active search
tables and the generation/fence-matched rail view; the projector login cannot read
that view and owns projection/event/rebuild functions. Catalog snapshot access has
its own private credential volume. Router has a separate Discovery credential and
starts independently, so an unavailable optional Discovery cannot prevent Catalog
or Playback traffic. No cross-owner SQL or Redis authority is introduced.

Finite OpenTelemetry instruments record rail kind/outcome, selection duration,
served freshness and deterministically sampled search result/top-rank buckets.
The optional home cache adds finite fresh/stale/miss, source/refresh,
coalescing and lease outcomes under the fixed `discovery_rail` family.
They never label query/title text, title/profile/correlation IDs, credentials or
media URLs. These measurements are not an SLO or popularity signal.

The subgraph accepts one named root operation, a 16 KiB body, bounded
parser/depth/alias/96-field/1024-cost limits and four active requests. Search has
two active permits, one FIFO waiter and a 100-ms maximum wait; overflow or expiry
returns `DiscoverySearchCode.LIMIT_EXCEEDED` with a null connection in the public
GraphQL payload, while home rails do not enter that lane. The field
budget includes Router's bounded entity metadata for all six
possible rails. Application, owner-read, SQL and broker work receive finite
deadlines and cancellation. Readiness requires schema version 3 and an active
projection; Catalog or broker failure makes projection maintenance unavailable
without changing Catalog or Playback admission.

Replay one exact retained local quarantine record only after correcting its underlying owner or projection condition:

```sh
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/events.yml --file infra/compose/discovery.yml --profile runtime exec -T --env ASTER_DISCOVERY_REPLAY_ENABLED=true discovery node ./dist/src/replay-catalog-event.js "$QUARANTINE_ID"
```

The command requires one UUID, local event activation, the projector role and the purpose-separated Catalog credential. It revalidates the retained bytes through the same owner snapshot and projection path, removes the slot only after an applied or duplicate durable result, emits no record bytes, and has a five-second deadline. A missing, still-invalid or unavailable record fails without editing or deleting it.

Rollback stops the optional Discovery overlay and restores compatible Router/Catalog artifacts. Keep the Discovery database, version fences, quarantine and previous active generation. Do not delete Catalog or retained local data to repair a failed rebuild.

## Verification

```sh
pnpm discovery:integration
pnpm discovery:cache-integration
pnpm discovery:runtime
```

The first command uses a disposable PostgreSQL 18.6 fixture to prove migrations,
role isolation, relevance, stable keysets, rail ordering/fallback,
generation-fence matching, rebuild/event recovery and the GIN plan. The second
starts one UUID-named disposable Redis container and proves bounded reads,
fresh/stale reuse, recoverable coordination, outage fallback and exact cleanup. The third
builds a UUID-named
disposable Docker project, projects Catalog through Kafka, exercises search and
home rails through Router, proves nullable Engagement partial response, restart
recovery, zero lag, sanitized logs and exact cleanup. Product metrics are also
collected in the focused Discovery/telemetry contract test. It does not use
retained product data or prove browser integration, hosted controls or load
capacity. [Phase evidence](../../evidence/phase-09/README.md).
