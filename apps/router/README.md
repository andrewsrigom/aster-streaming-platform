# Supergraph Delivery

Status: Phase 04 implementation is local; complete acceptance/release remains in progress. This package builds schemas. The separate pinned Apollo Router container executes them with private Identity/Catalog subgraphs, owner-validated sessions and bounded telemetry. [Current evidence](../../evidence/phase-04/README.md).

## Commands

From the repository root after `pnpm install --frozen-lockfile`:

```sh
pnpm schema:check
pnpm schema:update
pnpm --filter @aster/router test
```

Both root schema commands first build Identity, Catalog and this tooling through declared workspace dependencies. Each owner prints its executable Federation schema in a bounded local child process; no service, PostgreSQL, Docker, GraphOS registry, credential or introspection request is needed. `schema:check` is read-only. `schema:update` explicitly regenerates the five files under [infra/router/generated](../../infra/router/generated/manifest.json), then verifies them. Commit the resulting artifact set together, not a hand-edited subset.

The generated set contains both subgraph SDLs, the public API SDL, Router-ready supergraph SDL and a format-version-1 manifest with exact tool versions, file hashes, field/entity ownership and twelve known-operation hashes. Routing URLs are internal service names, not public endpoints. Composition uses the existing approved Apollo 2.14.4 and GraphQL 16.14.2 pins; [ADR-0003](../../docs/adr/0003-federation.md) and [ADR-0014](../../docs/adr/0014-apollo-federation-license-policy.md) remain applicable.

## Compatibility and limits

The [known operations](../../infra/router/known-operations.graphql) cover all current root fields, profile commands, Catalog metadata/attribution and a mixed nullable viewer/title query. They are build-time contracts, not a runtime persisted-operation allowlist. An ownership collision, invalid operation, stale output or breaking baseline API rejects the candidate.

CI compares against the PR base SHA (or previous push SHA), never merely the candidate's regenerated API. Manual runs resolve the merge base with `origin/main`; when that is the candidate itself, they use its first parent. A missing baseline/history or explicit self-comparison fails before the source gate. It reads the previous API and operation file directly from that commit, so deleting or rewriting current fixtures cannot hide a broken existing operation. `ASTER_SCHEMA_BASE` accepts only a full commit SHA; local commands default to local `main`. A pre-supergraph commit with neither file is the initial bootstrap; one missing file is an error. Intentional breaking evolution requires a separate reviewed migration, not bypassing this check.

SDL and operation sources are capped at 128 KiB and 20,000 tokens, known operations at 32, generated files at 1 MiB. Schema printers have a five-second deadline, 128 KiB output cap and no inherited environment. Git reads have five-second deadlines and output caps. Invalid UTF-8 and symbolic artifact files are rejected. Regeneration failure can leave an incomplete local output set; rerun the explicit update or restore its Git version, and never publish until read-only verification passes.

The existing source gate runs this package's tests and artifact check. Compiler outputs are cached; the small schema test/check is uncached because a local Git baseline can move without a source change. Root artifact inputs and owner dependency edges select it for affected checks. No additional workflow, remote cache or hosted resource was created.

## Schema conventions

| Concern | Current contract |
| --- | --- |
| Ownership | Identity owns Profile/viewer/session/profile fields; Catalog owns Title/browse/metadata/attribution. Every current contributed type and field is enumerated by owner in the generated manifest. Keys are `Profile.id` and `Title.id`; no persistence model is shared. |
| Scalars | GraphQL ID values are opaque UUIDs validated by owners; Int is bounded by its owner. `Viewer.expiresAt` remains a UTC ISO-8601 String. Locale, URL and cursor Strings retain owner validation; no generic JSON or unimplemented custom scalar is introduced. |
| Errors | Identity expected mutation outcomes use `IdentityOutcome` payloads and correlation IDs. Router maps GraphQL errors to fixed public messages and a finite code vocabulary while retaining error paths; it omits upstream internal details. HTTP/GraphQL errors do not imply a committed mutation was rolled back. |
| Pagination | Catalog uses ascending UUID keysets, `first` 1–20, opaque versioned cursors, first+1 lookahead and no total. No shared snapshot across pages. Profile lists have the existing owner bound, not a new connection API. |
| Nullability | `me`, `profile`, `activeProfile` and `title` can be null; `profiles` and `titles` are non-null roots. A failure on a non-null root can null the whole response. Real `ViewerAndTitle` timeout tests retain Identity data while Catalog's nullable root fails. |
| Evolution | Add compatible fields first; keep known operations, add `@deprecated(reason: ...)` before removal and migrate clients. No field is currently deprecated. Removal or changed ownership requires a reviewed compatibility plan. |

## Runtime and diagnostics

Normal Compose publishes only `127.0.0.1:4000/graphql`. POST JSON requires the matching Origin and `x-aster-csrf: 1`; public identity, forwarding, authorization and trace headers are rejected. Sessions travel only to Identity, which still checks signatures, durable revocation and resource ownership. Catalog stays anonymous/read-only. [ADR-0017](../../docs/adr/0017-local-router-trust.md) defines this explicitly local, non-hosted trust model.

The finite `router-trust-init` job creates two random per-owner credentials (private owner-readable files). Router mounts both read-only; each owner mounts only its own. Valid files are reused on restart. Missing, malformed or insecure files fail startup closed. Never print these files or pass their contents through environment variables or command arguments. Normal stop retains the named volumes. For rotation, stop the owned stack, validate the exact two trust-volume labels and absence of foreign attachments, remove only those volumes, and recreate all three consumers together. Do not delete PostgreSQL to rotate transport keys. The explicit guarded whole-project reset also recognizes both disposable volumes; it is not the key-only rotation command.

Core limits are 32 KiB request bodies, 64 headers/16 KiB header bytes, 2000 parser tokens, recursion 32, 512 recursive selections, 256 KiB subgraph responses, eight Router requests and a 64/s process-global burst. Router and fetch deadlines are three/two seconds; client disconnect cancels owner reads. Owner depth/alias/list/cost guards remain active. Native GraphOS-key-protected depth/alias limits are not configured; complete hosted abuse protection belongs to Phase 13. No unsafe mutation retry is added.

The runtime emits JSON operation/fetch events, finite operation buckets and internal Prometheus metrics. The observability overlay exports traces to the private Collector; it removes native arbitrary operation names/documents before the bounded debug exporter. Logs rotate at 5 MiB × 2. This is trace evidence, not a dashboard, SLO or throughput benchmark. A telemetry outage cannot become a product dependency.

Host-side checks with the pinned Node toolchain:

```sh
pnpm identity:demo
pnpm router:demo --project aster
```

`router:demo` pauses only its inspected Catalog container to test timeout, partial errors and admission, then unpauses it and verifies revocation/recovery. Do not run fault checks while another user needs the local demo. `pnpm router:lifecycle aster-p04-development` additionally checks cancellation against a real SQL lock, Collector failure and Router stop/recovery; it accepts only the dedicated development or UUID-named proof project, not retained `aster`.

For query-plan/trace inspection, add `--file infra/compose/router-diagnostics.yml` to the base plus observability files and recreate Router. Then run `pnpm router:observability aster`; it prints the actual plan, finite operation event and sanitized Collector trace. Remove that diagnostic overlay and recreate Router afterward. Default responses never expose query plans, even when the client asks. `subgraph-diagnostics.yml` is a separate opt-in standalone transport with loopback 3100/3200, private trust disabled and Identity Origin 3100; it is not a federated topology. Restore the normal containers before invoking the guarded reset, which rejects unreviewed Compose provenance.

Router health on internal 8088 means the process is running; it does not promise all subgraphs are available. Internal metrics use 9091. Owners retain their independent health/readiness and database authority. Startup waits for both owners; subsequent partial failure does not force unrelated data to fail.

## Evidence and recovery

[Composition evidence](../../evidence/phase-04/composition.txt) records deterministic output, negative cases and committed-baseline isolation. [Runtime evidence](../../evidence/phase-04/README.md) separately records network/session/failure/telemetry checks. Neither proves browser playback or hosted compatibility. Rollback stops the owned Router stack and restores the prior standalone configuration without changing product tables.

Upstream references: [composition](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/composition) and [composition rules](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/reference/composition-rules), checked 2026-08-27. Aster's npm-based offline command is tested directly; it does not claim to invoke Rover or a registry.
