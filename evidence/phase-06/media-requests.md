# P06-R01: Durable media request checkpoint

- Status: implemented; local request acceptance verified, not the complete Phase 06 gate.
- Date: 2026-08-28.
- Source: local change on 1f6930e49b9946b9de98eb93f7bd31ce9a3db754, branch feat/p06-media-pipeline; exact Catalog files in [source hashes](media-request-source.sha256).
- Owner: Catalog. Decision: [ADR-0021](../../docs/adr/0021-catalog-media-requests.md).

## Question and change

Can the existing operator retain duplicate-safe processing intent only for the current approved source, without downloading media, granting worker publication authority or changing editorial state?

The baseline has approved rights and publication commands but no durable request. This change adds the strict request/source contract, application authorization, PostgreSQL adapter, additive migration 0004 and `request-media` CLI. No new dependency or network-facing endpoint is added.

## Environment and workload

WSL Linux on a shared Windows host; Node 24.19.0 and pnpm 11.24.0. PostgreSQL 18.6 uses the repository-pinned image in one new labelled fixture: 1 CPU, 384 MiB, 128 PIDs, 256 MiB tmpfs, loopback ephemeral port. The runner verifies ownership/mounts before removing only that disposable container. Retained demo databases and owner programs are unchanged. No Redis, broker, FFmpeg or source download is needed for this metadata boundary.

A Windows diagnostic sample before the checks reported CPU 76%, RAM 26.57/31.73 GiB and 589 processes. It is not continuous host monitoring or an isolated benchmark. The functional checks must pass without requiring an idle desktop; no performance budget was changed and no Web benchmark was repeated.

Commands from the repository root:

~~~sh
pnpm --filter @aster/catalog build
node --test services/catalog/dist/test/media-request.test.js services/catalog/dist/test/operator-input.test.js
node --test services/catalog/dist/test/*.test.js
node tools/run-catalog-integration.mjs
node --test services/catalog/dist/test/reviewed-source.test.js
~~~

The focused iteration passes 12/12. [Full Catalog output](media-request-unit.txt) passes 108/108 in 4926.271502 ms. A later assertion ties the executable first-film request to the reviewed source; its focused test passes 1/1 in 230.678128 ms. The only later runtime edit removes two unused exports without changing executable policy; the example/test addition and export visibility cannot change the earlier database behavior. No migration or CLI behavior changed after the final integration run.

## Results

[Raw PostgreSQL/CLI output](media-request-postgres.jsonl), exit 0, fixture lifecycle 25207 ms:

- Eight concurrent identical requests return one durable record and identical results; a separate repository read recovers it. A second CLI process also replays the original persisted audit.
- Changed input and duplicate work under another key conflict; acceptance leaves title version 3 / RIGHTS_REVIEWED and no publication.
- An injected failure after INSERT rolls back; retrying that exact request succeeds.
- The runtime can SELECT/INSERT, not change/delete/truncate request audit. Public readers cannot read it. A deliberately overprivileged fixture CLI role is rejected, then its temporary grant is removed.
- Empty migration 0004 down/up and upgrade from schema 3 pass. Nonempty down fails and retains requests.
- Sixteen distinct requests reach the bound; overflow is refused, replay adds no slot and retirement still succeeds. Retired requests cannot be replayed as eligible work.
- A synchronized title-lock race commits the rights dispute and rejects the waiting media request with zero inserted requests.
- Unit negatives also cover weak/malformed ETags, byte bounds, source/checksum/revision substitution, injected controls, unauthorized input, cancellation, rights/authority expiry and failure after insertion.
- Existing Catalog rights, public-read, publication, CLI and cancellation checks remain passing. The fixture closes all reserved database slots and leaves zero owned containers.

The first integration run also passed in 23413 ms. It was repeated once because a subsequent CLI privilege guard changed the security boundary, not to improve timing. Initial lint found five test-only typing/string issues, corrected before the final run. The first affected-scope gate then identified two unused exports and cancelled concurrent tasks; those cancellations are not failed functional assertions or a Windows diagnosis. Removed the exports rather than weaken the check. Timings are observed test durations, not throughput/SLO claims.

Final `pnpm check:changed` passes 36/36 tasks (21 cached) in 50.03 s, including all 108 Catalog tests on the final source, strict type checks, lint, formatting, unused-code, architecture, docs, repository memory and secret checks. [Initial gate](media-request-quality-initial.txt) and [final gate](media-request-quality.txt) preserve both outcomes, with trailing whitespace removed. The source hashes identify the later unchanged behavior; no extra PostgreSQL or Web benchmark is needed for removed exports or evidence prose.

## Interpretation and next boundary

Retain this local implementation. A request is durable intent, not a worker credential or an approved technical report. The actual Big Buck Bunny title remains approved but has not yet been requested in the retained development database, acquired or processed. Attempt state/leases, bounded streaming acquisition, immutable S3 writes, isolated extraction/FFmpeg, validation and publication are still pending. The recipe identifier is a contract, not a completed encoder.

No clean Docker rebuild, browser suite, transcoding or hosted CI is claimed by this checkpoint. Those gates run when the complete media candidate can exercise them. Re-run the database experiment only for affected authority, request, persistence, migration or CLI changes; unrelated prose does not invalidate it. Stop admission to roll back code; keep nonempty request audit and use roll-forward migrations.
