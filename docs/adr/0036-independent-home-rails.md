# ADR-0036: Independent home rails and owner-preserving personalization

- Status: Accepted
- Date: 2026-08-29
- Owners: Discovery, Engagement and Catalog
- Requirements: P09-R03, P09-R04, P09-R05, P09-R08, P09-R09

## Decision

Expose one bounded public `homeRails` query from the existing Discovery subgraph.
It returns separately coded featured, recently added, curated trending and genre
results. The response contains at most twelve `Title` references in each rail and
at most three genre rails. Every served rail identifies its projection generation,
oldest indexed time and earliest visibility expiry. Catalog remains the current
metadata, publication and rights owner through Federation.

Read rail facts from the released current-source projection. Add a read-only view
that joins a generation row to the matching title fence only when source version
and document digest agree. It exposes title ID, source version, indexed time,
visibility expiry, publication time, genres and editorial labels. This prevents a
generation from borrowing newer metadata from the global fence. The runtime role
can select only the view; the projector roles and write paths remain unchanged.
No new store, cache, event or cross-owner SQL is introduced.

The fixed definitions are:

- featured: the `featured` Catalog editorial label, ordered by publication time
  and title ID;
- recently added: publication time and title ID descending/ascending respectively;
- curated trending: the `trending` Catalog editorial label with the same stable
  order;
- genres: the three most represented current genre slugs, ordered by title count
  then slug, with each rail ordered by publication time and title ID.

Curated trending is an explicit editorial signal. It does not claim behavioral
popularity, a real-time trend or a recommendation model. Real-time social trends
remain a Phase 09 non-goal. A future behavior-derived ranker would require its own
privacy, deletion, consistency and event decision.

Execute the four primary selections sequentially in fixed featured, recently
added, curated-trending and genre order. Each selection uses its own read-only
transaction and failure result, so a request holds at most one transaction and a
statement failure cannot roll back another rail. Existing GraphQL request
concurrency and deadlines bound total work; aggregate the four independent
outcomes after the final selection. If featured or curated trending is empty or
unavailable and the independent recent selection completed with titles, serve
those recent references as `FALLBACK` and identify `RECENTLY_ADDED` as the served
source. Do not fabricate a fallback when recent is stale, unavailable or empty.

Add a nullable `homeContinueWatching` root to Engagement that invokes the existing
authorized continue-watching application query. It adds no table, projection or
Discovery call. A personalized Router operation selects `homeRails` and this
nullable sibling. Engagement subgraph failure may null the personalized field and
produce a GraphQL error without nulling public home data. Internal owner failures
still return Engagement's existing explicit payload code. Public SSR does not send
profile identity. P09-R10 implements this split: Web server-renders exact bounded
`HomePublic` and `SearchTitles` operations through a request-scoped public Apollo
client and positive projection. The browser checks Identity first and sends exact
`HomePersonalized` only through the isolated private Apollo client after an active
profile is owner-confirmed. Profile changes, expiry and sign-out cancel and discard
that private cache. Public rails stay present when the nullable Engagement field
or the whole Discovery service is unavailable; Catalog browse remains the
independent public fallback when Discovery itself cannot respond.

## Contract and failure behavior

Discovery result codes distinguish completed, empty, fallback, stale, unavailable,
cancelled and indeterminate outcomes. The home payload is `COMPLETED` only when all
groups completed without fallback; it is `PARTIAL` when at least one usable group
coexists with fallback or failure, and unavailable/stale/cancelled/indeterminate
when no group is usable. Empty is a successful explicit state, not a dependency
error. Structured logs classify `COMPLETED` as successful, usable `PARTIAL`
responses as degraded and rejected/unusable operations as rejected. A title
reference may resolve to null if Catalog retires it after rail selection; other
entries remain usable.

The three genre rails can flatten at most36 `Title` representations into one
Catalog Federation fetch when `first` is12. Catalog accepts exactly that finite
entity ceiling while retaining20 for ordinary product lists. Its request-scoped
DataLoader splits owner reads into batches of at most20, preserving the existing
application/SQL batch bound. Body, input-node, cost, deadline and concurrency
limits remain unchanged.

The projection's existing 300-second lease and proactive renewal remain the
freshness policy. Queries exclude expired rows. Retirement events update active and
building generations through ADR-0035, while Catalog remains the final visibility
check. Later Web fallback may use current Catalog browse when the whole optional
Discovery service is absent; the subgraph cannot provide a fallback while its
process is unavailable.

Instrument a finite rail-kind/outcome metric set: selection latency, request
outcomes from which empty/fallback rates are derived, and served freshness. Add a
deterministically sampled search-quality observation using only bounded result-count
and top-rank buckets. Never label metrics with query text, title ID, title text,
genre, profile ID, correlation ID or credentials. These are measurements, not an
SLO or product-popularity signal.

## Security, verification and recovery

Keep the existing Discovery body, parser, depth, alias, concurrency and deadline
controls. Home accepts only `first` from one through twelve. Operation cost accounts
for three fixed rails plus at most three genre rails. Engagement continues to
authorize the browser credential and profile at its owner; a Router directive or
client condition is not authorization.

Verify pure aggregation and fallback rules, independent statement failure, empty
and stale state, cancellation, generation/fence matching, restricted view grants,
stable ordering, GraphQL cost/composition/nullability, owner authorization, finite
metric attributes, Router partial response and a36-reference Catalog entity fetch
split into owner batches of at most20. Use real PostgreSQL for view/query
semantics and one disposable runtime for packaging and failure isolation. P09-R10
implements browser SSR/hydration and records its separate acceptance evidence.

Rollback restores the prior compatible subgraph/Router artifacts and drops only
the additive view when no rail binary uses it. Preserve projection generations,
fences, quarantine, Catalog/Engagement data and retained media. Disabling optional
Discovery must not affect Catalog, Playback or Engagement authority.
