# User Journeys

## Journey 1 — Discover and start a film

1. A viewer opens the home page.
2. Public editorial rails render on the server.
3. Profile-specific rails hydrate when an authenticated active profile exists.
4. The viewer opens a title page.
5. The page shows synopsis, credits, runtime, languages, accessibility information, source, license, and attribution.
6. The viewer selects Play.
7. Playback creates a short-lived session.
8. The player loads the HLS master playlist from the delivery URL.
9. First-frame telemetry records the result.

### Failure behavior

- Discovery failure falls back to stable catalog rails.
- Rights or publication failure rejects playback.
- Playback-session failure leaves the title page usable and presents a retry.
- Media delivery failure presents a specific recovery state and records telemetry.

## Journey 2 — Resume viewing

1. An authenticated viewer selects a profile.
2. The home page requests continue-watching.
3. Engagement returns resumable progress ordered by recent activity.
4. Catalog contributes current title metadata through Federation.
5. The viewer starts a title from the saved position.
6. Progress reports carry sequence and idempotency identifiers.
7. A stale delayed report is rejected without moving progress backward.
8. Reaching the completion threshold removes the item from continue-watching.

## Journey 3 — Search and watchlist

1. A viewer enters a search term.
2. Search normalizes and bounds the query.
3. Results return with keyset pagination.
4. An authenticated profile adds a title to its watchlist.
5. Repeating the mutation is safe and returns the same final state.
6. The title appears in the profile's watchlist.
7. Retiring the title removes it from normal reads and blocks new playback.

## Journey 4 — Publish a title

1. An operator creates a draft catalog title.
2. A rights record is completed and reviewed.
3. A source asset is acquired from the recorded location.
4. The worker streams the source into private object storage while calculating a checksum.
5. FFmpeg probes and processes the source under resource limits.
6. The worker packages renditions, audio, and captions into an immutable HLS version.
7. Technical validation checks manifests and referenced objects.
8. An operator approves metadata and artwork.
9. Catalog atomically associates the validated publication and moves the title to `PUBLISHED`.
10. Discovery caches are invalidated or versioned.
11. The public title and attribution pages become available.

### Failure behavior

- Failed downloads remain unpublished and clean temporary state.
- Failed processing retains diagnostics without exposing partial output.
- A retry is idempotent by processing recipe and source checksum.
- Publication cannot reference incomplete media.
- Rights uncertainty blocks the workflow.

## Journey 5 — Operate during a dependency failure

1. Discovery begins timing out.
2. Its concurrency limit prevents request accumulation.
3. The breaker opens after configured evidence.
4. The supergraph omits or replaces optional personalized rails.
5. Catalog and playback remain available.
6. Traces and metrics identify degradation.
7. An SLO alert links to the subgraph-outage runbook.
8. Recovery probes close the breaker after the dependency stabilizes.
