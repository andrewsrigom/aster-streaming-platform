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
- Before activation, retain private candidates and retry only a compatible transient failure. After activation, ordinary `retire` is the implemented takedown. Previous-version rollback/orphan reclamation are still Phase 06 work; do not manually overwrite/delete publication data. Populated migration 0007 requires roll-forward recovery.

`pnpm media:origin:test` verifies synthetic copies, replay, MIME/cache, CORS/Range and negative permissions. `pnpm catalog:integration` verifies real PostgreSQL registration/activation/dispute/privilege behavior. [Actual first-film evidence](../../evidence/phase-06/publication.md) is distinct from those synthetic tests.
