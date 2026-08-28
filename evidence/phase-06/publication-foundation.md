# Local publication foundation

- Date: 2026-08-28
- Base: `c2a90f3` on `feat/p06-media-pipeline`; exact later source in [checksums](publication-foundation.sha256).
- Scope: P06-R01/R03/R06/R08/R09/R10; Catalog owns approval, PostgreSQL owns state, S3 owns bytes.
- Status: foundation implemented and locally verified; first-film approval/attestation/publication remains unfinished. No retained title, rights, database, original, candidate or serving container was changed.

## Behavior and evidence

- [Focused confirmation](publication-confirmation.txt): 13 passing tests for checksum reuse, explicit absence, corrupt/oversized/short/signature-invalid objects, cancellation, rights revocation, and exact local-media URL/default-hosted rejection. An additional focused lint/build/eight-executor check passes after the equivalent strict-null lint correction.
- [Catalog regression](publication-foundation-tests.txt): initial 146 tests pass; final source gate includes the additional request-checksum authority regression.
- [Real PostgreSQL](publication-foundation-postgres.jsonl): complete Catalog integration, including `catalog_acquisition_reuse_authority` and `catalog_local_media_visibility`. A request checksum alone cannot authorize reuse; the current immutable approved rights record must bind it. Hosted/default reads exclude local manifests/artwork **before LIMIT**, while explicit local reads preserve batch order. Existing dispute, retry, audit, migration and isolation tests pass; clients/fixture close with no retained data changes.
- [Pinned S3 test](publication-origin.jsonl) and [Docker-only runner](publication-origin-docker.txt): anonymous GET/HEAD, exact CORS, byte ranges, MIME and immutable headers pass; bucket listing, private originals, non-public-prefix objects and writes fail. Even signed root writes fail at the read-only origin. Original reuse verifies actual stored bytes. Unexpected existing bucket policy is rejected, not overwritten. All owned fixture containers and the 16 MiB tmpfs volume were removed.
- `docker compose -p aster-p04-development -f infra/compose/compose.yml -f infra/compose/demo.yml -f infra/compose/media.yml --profile runtime --profile full --profile media config --quiet` passes; this validates configuration only and does not activate the retained origin.
- Repository gates: [source](publication-foundation-source.txt) passes 51/51 tasks, 37 cached, 64.88 seconds, including 147 Catalog tests. Documentation/security/CI-memory results are in [closeout](publication-foundation-closeout.txt).

## Environment and reproduction

Windows Docker Desktop, Linux containers, Node 24.19.0/pnpm 11.24.0, existing pinned PostgreSQL 18.6 and VersityGW 1.7.0. `pnpm media:origin:test` (or `node tools/run-media-origin-integration.mjs`) builds the Catalog build-stage test image and runs an isolated synthetic fixture; no host package installation or media download is used by that runner. Initial test image: `sha256:3eee084f15c825b9d6ea8c5e07558e63e7eb2e6052b11d9f351ead6655961f76`.

The PostgreSQL suite was `node services/catalog/dist/test/integration/rights-postgres.js 5432` in a scoped tooling client sharing only a disposable PostgreSQL container's network namespace. Source gate: `pnpm check:source --concurrency=2`. Closeout: `pnpm exec turbo run docs:check docs:test ai:check ai:test community:check community:test security:check security:test ci:check ci:test --concurrency=2`.

Tooling uses `aster-p06-tooling:git`, the canonical Linux workspace mount and UID/GID 1002:1002. Give its test-only `/tmp` the explicit `exec` mount option: reset tests execute a synthetic Docker script there, never the real daemon. An initial noexec mount caused those tests to fail. The image's small inherited Node heap also failed the workspace lint; override `NODE_OPTIONS=--max-old-space-size=1536` with a 2 GiB container cap and disable core dumps. These are scoped test-runner corrections, not host diagnosis or changed product budgets. No CPU benchmark or owner-process intervention occurred.

## Review and evidence reuse

Initial review found that a request-supplied checksum could otherwise reuse bytes without proof that the reviewed source owned that hash. The acquisition application now derives `reuseApproved` under its existing title/rights lock; the coordinator cannot infer it from input. Confirmation tests prove both rejection and the approved-checksum path. No other current requirement/security/data/public-contract blocker was found in this foundation.

The origin integration remains applicable after the later acquisition authorization refinement and CLI endpoint guards: its S3 adapter, publication policies, read-only flags and tested byte verifier are unchanged. PostgreSQL was repeated for the changed authority boundary. Original/HLS/JPEG recipes and bytes were untouched, so no film download, encoding, image regeneration or Web benchmark was repeated.

## Remaining and rollback

Implement immutable bundle assembly with truthful attribution; update the first film through existing editorial commands (preserving rights revision 2); submit a current-checksum-bound request and reuse original/HLS/artwork; add restricted technical-attester registration and activate through Catalog. Then prove partial-upload/dispute/rollback behavior, representative playback and final clean demo/release. The production local origin is opt-in and not started by these tests. Remove an unused origin without deleting its storage volume; before activation there is no new public title or active pointer to roll back.
