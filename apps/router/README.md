# Supergraph Delivery

Phase 04 is released. This package composes Identity, Catalog, Playback,
Engagement and the current Discovery search/home candidate. The separate pinned
Apollo Router executes the generated supergraph with private owner credentials
and bounded telemetry. [Phase 04 evidence](../../evidence/phase-04/README.md),
[Discovery evidence](../../evidence/phase-09/README.md).

## Commands

From the repository root after `pnpm install --frozen-lockfile`:

```sh
pnpm schema:check
pnpm schema:update
pnpm --filter @aster/router test
```

Both root schema commands first build Identity, Catalog, Playback, Engagement, Discovery and this tooling through declared workspace dependencies. Each owner prints its executable Federation schema in a bounded local child process; no service, PostgreSQL, Docker, GraphOS registry, credential or introspection request is needed. `schema:check` is read-only. `schema:update` explicitly regenerates the eleven files under [infra/router/generated](../../infra/router/generated/manifest.json), then verifies them. Commit the resulting artifact set together, not a hand-edited subset.

The generated set contains five subgraph SDLs, the public API SDL, Router-ready
supergraph SDL, an Apollo persisted-query manifest, a generated finite Router
matcher, a source-owned demand manifest and a format-version-1 delivery manifest
with exact tool versions, file hashes, field/entity ownership and the current 25
trusted-operation hashes. The persisted manifest and matcher include the bounded
current/retained rollout union, while the delivery manifest indexes exactly one
current hash per name. The demand manifest records one bounded shape, list
expansion and weighted-cost profile for every exact current or retained hash. Its
version-2 runtime policy also classifies authorization scope and rate class,
requires `no-store`, and pins the three-second/eight-request public execution
boundary for every admitted operation. Missing or weaker policy fails
composition. [ADR-0047](../../docs/adr/0047-bounded-graphql-execution-rate-and-cache-scope.md)
defines the account admission and cache-scope contract.
Manifest bodies use the exact link-ready Apollo `HttpLink` representation.
Routing URLs are internal service names, not public endpoints. Composition uses the existing
approved Apollo 2.14.4 and GraphQL 16.14.2 pins; [ADR-0003](../../docs/adr/0003-federation.md)
and [ADR-0014](../../docs/adr/0014-apollo-federation-license-policy.md) remain applicable.

## Compatibility and limits

The [known operations](../../infra/router/known-operations.graphql) cover all
current root fields, profile commands, Catalog metadata/attribution, bounded
Discovery search, public/personalized home composition and mixed entity queries.
They are build-time compatibility contracts and the current source for generated
runtime trusted-operation artifacts. During a reviewed client transition,
[retained operations](../../infra/router/retained-operations.json) can hold
one obsolete byte-exact wire body per name. It is parsed and schema-validated but
stored as an explicit JSON string and not reprinted by the current toolchain.
Generation accepts at most two distinct
wire hashes for a name and zero retained bodies outside an overlap window. The
union Router remains the rollback floor after new-hash traffic until both client
populations drain. An ownership collision, invalid operation, stale output or
breaking baseline API rejects the candidate.

All five subgraphs use Federation v2.9 `@cost` and `@listSize` metadata. Owners
retain their runtime input and pagination maxima. Composition requires every
selected root and list to expose finite metadata, expands fragments under fixed
bounds and rejects a trusted operation above any source-controlled demand limit.
Variables use the owner maximum; a positive literal may lower but never exceed
it. The generated profile is a review and delivery contract, not authorization
or live request telemetry. [ADR-0046](../../docs/adr/0046-source-owned-graphql-demand-budget.md)
defines the weights, conservative list semantics and rollback.

CI compares against the PR base SHA (or previous push SHA), never merely the candidate's regenerated API. Manual runs resolve the merge base with `origin/main`; when that is the candidate itself, they use its first parent. A missing baseline/history or explicit self-comparison fails before the source gate. It reads the previous API and operation file directly from that commit, so deleting or rewriting current fixtures cannot hide a broken existing operation. `ASTER_SCHEMA_BASE` accepts only a full commit SHA; local commands default to local `main`. A pre-supergraph commit with neither file is the initial bootstrap; one missing file is an error. Intentional breaking evolution requires a separate reviewed migration, not bypassing this check.

SDL and operation sources are capped at 128 KiB and 20,000 tokens, current and
retained operations at 32 each, the trusted union at 64 and versions per name at
two; generated files remain capped at 1 MiB. Schema printers have a five-second
deadline, 128 KiB output cap and no inherited environment. Git reads have
five-second deadlines and output caps. Invalid UTF-8 and symbolic artifact files
are rejected. Regeneration failure can leave an incomplete local output set;
rerun the explicit update or restore its Git version, and never publish until
read-only verification passes.

The existing source gate runs this package's tests and artifact check. Compiler outputs are cached; the small schema test/check is uncached because a local Git baseline can move without a source change. Root artifact inputs and owner dependency edges select it for affected checks. No additional workflow, remote cache or hosted resource was created.

## Schema conventions

| Concern | Current contract |
| --- | --- |
| Ownership | Identity owns Profile/viewer/session/profile fields; Catalog owns Title/browse/metadata/attribution; Playback owns createPlaybackSession and its result/session types; Engagement owns progress/watchlist; Discovery owns search and projection freshness metadata. Every current contributed type and field is enumerated by owner in the generated manifest. Keys are `Profile.id` and `Title.id`; no persistence model is shared. |
| Scalars | GraphQL ID values are opaque UUIDs validated by owners; Int is bounded by its owner. `Viewer.expiresAt` remains a UTC ISO-8601 String. Locale, URL and cursor Strings retain owner validation; no generic JSON or unimplemented custom scalar is introduced. |
| Errors | Identity expected mutation outcomes use `IdentityOutcome` payloads and correlation IDs. Router maps GraphQL errors to fixed public messages and a finite code vocabulary while retaining error paths; it omits upstream internal details. HTTP/GraphQL errors do not imply a committed mutation was rolled back. |
| Pagination | Catalog uses ascending UUID keysets, `first` 1–20, opaque versioned cursors, first+1 lookahead and no total. No shared snapshot across pages. Profile lists have the existing owner bound, not a new connection API. |
| Nullability | `me`, `profile`, `activeProfile` and `title` can be null; `profiles` and `titles` are non-null roots. A failure on a non-null root can null the whole response. Real `ViewerAndTitle` timeout tests retain Identity data while Catalog's nullable root fails. |
| Evolution | Add compatible fields first; keep known operations, add `@deprecated(reason: ...)` before removal and migrate clients. No field is currently deprecated. Removal or changed ownership requires a reviewed compatibility plan. |

## Runtime and diagnostics

Normal Compose publishes only `127.0.0.1:4000/graphql`. POST JSON requires the matching Origin and `x-aster-csrf: 1`; public identity, forwarding, authorization and trace headers are rejected. Sessions travel to Identity and Engagement only. Engagement forwards the bounded cookie only to Identity's private read; Identity checks signatures, durable revocation and resource ownership. Catalog stays anonymous/read-only. [ADR-0017](../../docs/adr/0017-local-router-trust.md) defines this explicitly local, non-hosted trust model.

The finite router-trust-init creates five per-owner Router credentials plus five separate owner-read credentials: Playback-to-Catalog, Engagement-to-Identity/Playback/Catalog and Discovery-to-Catalog. Router mounts only its five keys; each private-read key is shared solely by its two participants. Valid files are reused on restart; insecure or missing files fail startup. Never print credentials. For rotation, stop affected consumers, validate the exact disposable volume labels and absence of foreign attachments, replace only those volumes and restart consumers together. Retain PostgreSQL/media. The guarded whole-project reset recognizes all ten disposable trust volumes but is not a key-only rotation command. [Discovery trust and operations](../../services/discovery/README.md#runtime-and-failure-boundaries).

Core limits are 32 KiB request bodies, 64 headers/16 KiB header bytes, 2000 parser tokens, recursion 32, 512 recursive selections, 256 KiB subgraph responses, eight Router requests and a 64/s process-global burst. Router and normal owner fetch deadlines are three/two seconds; Playback and Engagement have a 2700 ms fetch budget around their 2000/2500 ms application deadlines. Client disconnect cancels owner work. Every response admitted to the GraphQL service is `no-store`; the pre-service oversized-body rejection contains no data, explicit freshness or validators. Apollo Server response/document caches remain disabled, while public Catalog/Discovery source caches keep their separate owner policies. Owner depth/alias/list/cost guards remain active. Exact hosted operations additionally pass source composition limits of depth 12, eight aliases, four roots, 256 selections, 512 maximum list expansion and weighted cost 2,048. Native GraphOS demand control is not activated because it would add an account and hosted control-plane contract; the local build remains reproducible without credentials. No unsafe mutation retry is added.

The runtime emits JSON operation/fetch events, finite operation buckets and
internal Prometheus metrics. The P12-R05 candidate classifies known Router
responses as `completed`, `rejected` or `failed`, attaches only that outcome and
the finite operation bucket to the standard duration histogram, and caps the
instrument at 128 series. Its explicit finite histogram boundaries include the
300 ms Catalog-title-read objective; repository policy rejects a query/runtime
bucket mismatch. The observability overlay exports traces to the
private Collector and lets Prometheus scrape Router metrics on the private
platform network; arbitrary operation names/documents remain absent. Logs
rotate at 5 MiB × 2. Recording rules are SLI mechanics, not a historical SLO or
throughput benchmark. A telemetry outage cannot become a product dependency.

Host-side checks with the pinned Node toolchain:

```sh
pnpm identity:demo
pnpm router:demo --project aster
```

`router:demo` pauses only its inspected Catalog container to test timeout, partial errors and admission, then unpauses it and verifies revocation/recovery. Do not run fault checks while another user needs the local demo. `pnpm router:lifecycle aster-p04-development` additionally checks cancellation against a real SQL lock, Collector failure and Router stop/recovery; it accepts only the dedicated development or UUID-named proof project, not retained `aster`.

For query-plan/trace inspection, add `--file infra/compose/router-diagnostics.yml` to the base plus observability files and recreate Router. Then run `pnpm router:observability aster`; it prints the actual plan, finite operation event and sanitized Collector trace. Remove that diagnostic overlay and recreate Router afterward. Default responses never expose query plans, even when the client asks. `subgraph-diagnostics.yml` is a separate opt-in standalone transport with loopback 3100/3200, private trust disabled and Identity Origin 3100; it is not a federated topology. Restore the normal containers before invoking the guarded reset, which rejects unreviewed Compose provenance.

Router health on internal 8088 means the process is running; it does not promise all subgraphs are available. Internal metrics use 9091. Owners retain independent health/readiness and database authority. Base Router startup requires Catalog, Playback and trust initialization, not optional Identity/Engagement/Discovery. The explicit Discovery overlay adds Discovery as a startup dependency because that topology exposes the search operation. Starting the base runtime/full profile supports anonymous playback without optional owners; their fields fail independently while absent.

## Evidence and recovery

[Composition evidence](../../evidence/phase-04/composition.txt) records deterministic output, negative cases and committed-baseline isolation. [Runtime evidence](../../evidence/phase-04/README.md) separately records network/session/failure/telemetry checks. Neither proves browser playback or hosted compatibility. Rollback stops the owned Router stack and restores the prior standalone configuration without changing product tables.

Upstream references: [composition](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/composition) and [composition rules](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/reference/composition-rules), checked 2026-08-27. Aster's npm-based offline command is tested directly; it does not claim to invoke Rover or a registry.
