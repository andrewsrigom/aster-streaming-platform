# Local immutable media publication

Catalog owns technical registration and editorial activation. This opt-in workflow uses existing rights, retained HLS/JPEG processing, private S3 and the read-only loopback origin. It does not download or re-encode a film and is not the Phase 07 one-command player demo.

## Commands

From the repository root, use the existing project name for PROJECT. Run the Catalog initializer to apply current additive migrations, then build the publication service. Preserve existing volumes.

```sh
docker compose -p PROJECT -f infra/compose/compose.yml -f infra/compose/media.yml --profile integration --profile media build media-publish
docker compose -p PROJECT -f infra/compose/compose.yml -f infra/compose/media.yml --profile integration --profile media run --rm --no-deps -T media-publish preview TITLE_ID EXPECTED_VERSION HLS_ATTEMPT_ID ARTWORK_ATTEMPT_ID < proposed-edit.json
```

Preview reads only: input is an ordinary Catalog `edit` command with proposed source/artwork rights facts and actual modifications. Its version must match the inspected title. It derives the final poster/manifest URLs, but grants no approval or publication authority. Review-generated IDs/times and derived URLs do not participate in the bundle hash. Replace the proposed artwork URL and its rights asset URL with the preview result, then use the existing retire/reopen/edit/review workflow. Inspect versions between commands. Never edit historical approvals or create a second source download merely to renew metadata.

After that editorial review, using its current version:

```sh
docker compose -p PROJECT -f infra/compose/compose.yml -f infra/compose/media.yml --profile integration --profile media run --rm --no-deps -T media-publish attest TITLE_ID EXPECTED_VERSION HLS_ATTEMPT_ID ARTWORK_ATTEMPT_ID
docker compose -p PROJECT -f infra/compose/compose.yml -f infra/compose/media.yml --profile integration --profile media up -d --no-deps --no-build --wait --wait-timeout 20 media-origin
```

Successful attestation returns a publication UUID, not editorial activation. Confirm the manifest is reachable, then use ordinary `media-ready` and `publish` commands with inspected versions. The [first-film example](examples/big-buck-bunny-publication.json) is the exact historical edit payload, not a command to replay against a later version.

## Boundaries and recovery

- The attester login has Catalog-only reads and EXECUTE on one fixed-search-path function. No direct INSERT/UPDATE/DELETE, editor membership, active-pointer write or cross-context access.
- Each object is streamed into a fresh bounded temporary file, verified, conditionally written with correct MIME/immutable cache headers and fully read back. Children precede the master. Partial copies cannot become Catalog's active publication.
- One object at a time avoids overlapping read/write actions on the private single-writer POSIX gateway. Limits: 16 MiB/object, 512 MiB HLS candidate, five bounded JPEGs, 32 MiB tmpfs, five-minute job, 15-second storage operations.
- Existing keys are never overwritten. A lost registration response can be retried with the same selection/current version; the same title/rights/bundle yields the same publication ID. At most 64 registrations/title; audit is not evicted.
- Disputes/version changes/expiry stop copying or final registration. Registration serializes on the same title lock as editorial commands; network work never holds that database lock.
- The origin joins only `edge`, binds Windows/local loopback 9001 and mounts storage read-only. It cannot reach private databases/writer. Anonymous GET/HEAD is limited to publication objects; listing and every write are denied. Do not change it to an internal-only network or widen its host binding.
- Before activation, retain private candidates and retry only a compatible transient failure. After activation, ordinary `retire` is the immediate takedown. Use compatible replacement/rollback below; orphan reclamation remains Phase 06 work. Do not manually overwrite/delete publication data. Populated migrations 0007/0008 require roll-forward recovery.

## Replace or roll back an active publication

Apply migration 0008 with the current initializer before these commands. Use the normal local operator, not the attester. Inspect the title and select an existing registered publication ID; neither command accepts a URL or validation flags.

```json
{"command":"replace","input":{"titleId":"00000000-0000-4000-8000-000000000001","mutationId":"00000000-0000-4000-8000-000000000002","expectedVersion":5,"publicationId":"00000000-0000-4000-8000-000000000003","reason":"Activate a validated compatible version"}}
```

This is an input-shape example, not a command for the retained first film. For recovery, use `rollback` with the inspected current version, a new mutation ID and the previously active publication ID. The target must have been active before the current title version, belong to the same title/current rights revision and original checksum, and still satisfy validation/expiry policy. Artwork and editorial metadata stay unchanged. Both operations keep PUBLISHED state and atomically record the new pointer, incremented version, reason/audit, receipt, activation history and title-published event. Current streams may finish on their immutable old URL; no media bytes are rewritten.

Activation history survives outbox delivery. Exact command retries use the same mutation/input within the existing 24-hour receipt window; returned receipts describe the historical command, not current authorization. Missing history, incompatible rights, dispute, cancellation or a stale version leaves the pointer unchanged. Never bypass a rejection with direct SQL. Retire when no compatible version exists. The current first film has only one registered/active bundle, so there is no real prior version to restore yet. [Synthetic rollback evidence](../../evidence/phase-06/rollback.md) does not claim a second film encode.

`pnpm media:origin:test` verifies synthetic copies, replay, MIME/cache, CORS/Range and negative permissions. `pnpm catalog:integration` verifies real PostgreSQL registration/activation/dispute/privilege behavior. [Actual first-film evidence](../../evidence/phase-06/publication.md) is distinct from those synthetic tests.
