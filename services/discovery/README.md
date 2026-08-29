# Discovery search

P09-R01, P09-R02, P09-R06 and P09-R07 are implemented in the current candidate. Discovery owns a rebuildable PostgreSQL read model and bounded title search. Catalog remains the authority for title metadata, publication and rights; search edges return federated `Title` references so current public metadata is resolved by Catalog.

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

## Projection and recovery

Catalog v1 publication events are bounded invalidation hints. For each accepted hint, Discovery fetches one current snapshot through its purpose-separated private Catalog operation before writing. Older versions cannot replace newer state, same-version conflicts fail closed, and retirement or rights-expiry fences cannot be resurrected by replay.

The active projection stores source version, event provenance, indexed time and a five-minute visibility lease capped by Catalog rights expiry. Expired public rows produce `STALE`, not a fabricated empty success. Consumer progress is stored in the same Discovery transaction before broker acknowledgement. Invalid bounded records enter a finite quarantine; oversized records and full quarantine remain uncommitted.

A rebuild captures one broker high-water barrier, scans current Catalog snapshots in bounded UUID-keyset pages, applies concurrent events to both active and building generations, waits for durable consumer catch-up and then atomically promotes the building generation. An absent checkpoint covers only broker position zero. The maintenance runtime starts a new generation when the active generation reaches half of its five-minute lease. The prior active generation remains serviceable during maintenance until its lease expires; bootstrap and expired generations remain unavailable. Failed or partial rebuilds never replace the active generation. Durable cursor, barrier and source-version fences allow restart without depending on broker retention. At most the active and one building generation are retained.

## Runtime and failure boundaries

Discovery listens privately on 3500. The API login can read only the active search view; the projector login owns projection/event/rebuild functions. Catalog snapshot access has its own private credential volume. Router has a separate Discovery credential and starts independently, so an unavailable optional Discovery cannot prevent Catalog or Playback traffic. No cross-owner SQL, Redis authority, raw query text, title text, credential or signed media URL enters telemetry.

The subgraph accepts one named root operation, a 16 KiB body, bounded parser/depth/alias/field/cost limits, four active requests and no hidden queue. Application, owner-read, SQL and broker work receive finite deadlines and cancellation. Readiness requires the owned schema and an active projection; Catalog or broker failure makes projection maintenance unavailable without changing Catalog or Playback admission.

Replay one exact retained local quarantine record only after correcting its underlying owner or projection condition:

```sh
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/events.yml --file infra/compose/discovery.yml --profile runtime exec -T --env ASTER_DISCOVERY_REPLAY_ENABLED=true discovery node ./dist/src/replay-catalog-event.js "$QUARANTINE_ID"
```

The command requires one UUID, local event activation, the projector role and the purpose-separated Catalog credential. It revalidates the retained bytes through the same owner snapshot and projection path, removes the slot only after an applied or duplicate durable result, emits no record bytes, and has a five-second deadline. A missing, still-invalid or unavailable record fails without editing or deleting it.

Rollback stops the optional Discovery overlay and restores compatible Router/Catalog artifacts. Keep the Discovery database, version fences, quarantine and previous active generation. Do not delete Catalog or retained local data to repair a failed rebuild.

## Verification

```sh
pnpm discovery:integration
pnpm discovery:runtime
```

The first command uses a disposable PostgreSQL 18.6 fixture to prove migrations, role isolation, relevance, normalization, keyset stability, retirement fences, rebuild/cursor state, event recovery and the GIN plan. The second builds a UUID-named disposable Docker project, performs Catalog-to-Kafka-to-Discovery projection, searches through Router, checks an empty result, restart recovery, zero consumer lag and sanitized finite telemetry, then verifies exact cleanup. It does not use retained product data or prove rails, browser integration, hosted operation controls or load capacity. [Phase evidence](../../evidence/phase-09/README.md).
