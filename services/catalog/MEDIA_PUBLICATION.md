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
- Each object is streamed into a fresh bounded temporary file, verified, conditionally written with correct MIME/immutable cache headers and fully read back. Children precede the master. The entire prefix stays private until complete verification and one exact-prefix policy grant; partial copies cannot be read anonymously or become Catalog's active publication.
- One object at a time avoids overlapping read/write actions on the private single-writer POSIX gateway. Limits: 16 MiB/object, 512 MiB HLS candidate, five bounded JPEGs, 32 MiB tmpfs, five-minute job, 15-second storage operations. Access confirmation has a ten-second deadline; rejected confirmation gets a separate ten-second compensation deadline, including after caller cancellation.
- Existing keys are never overwritten. A lost registration response can be retried with the same selection/current version; the same title/rights/bundle yields the same publication ID. At most 64 registrations/title; audit is not evicted.
- Disputes/version changes/expiry stop copying or final registration. The access barrier remains held through post-grant rights validation and restricted SQL registration. Rejection restores this attempt's newly added prefix to the exact previous policy and verifies it before unlocking; a previously granted prefix is not revoked by a failed replay. Registration serializes on the same title lock as editorial commands; network work never holds that database lock.
- The origin joins only `edge`, binds Windows/local loopback 9001 and mounts storage read-only. It cannot reach private databases/writer. Anonymous GET/HEAD is limited to publication objects; listing and every write are denied. Do not change it to an internal-only network or widen its host binding.
- Before activation, retain private candidates and retry only a compatible transient failure. After activation, ordinary `retire` removes Catalog availability; it does not revoke already-granted immutable CC URLs. Use compatible replacement/rollback below. Disposable scratch cleanup is implemented; immutable storage is retained under ADR-0026, with hosted lifecycle decisions deferred to Phase 14. Do not manually overwrite/delete publication data. Populated migrations 0007/0008 require roll-forward recovery.

## Recover an interrupted access grant

Publication policy is bounded to 100 verified prefixes. Its private `aster-media-published/control/publication-access.lock` serializes grants, preserving previous publications. Before mutation the owner records its exact `previousPrefixes` snapshot in that held lock. Normal success reads back the complete policy, confirms current rights and SQL registration, then removes only the lock. A competing publisher fails immediately. Confirmed grants whose confirmation rejects are compensated and read back before unlock; an uncertain write/readback, crash or failed compensation retains the barrier. The command reports `accessRecoveryRequired: true` when it knows the barrier remains.

PostgreSQL and S3 are not one atomic transaction. A new prefix can be readable during the bounded grant/confirmation window; compensation removes its origin permission, not already downloaded/cached bytes. This is not an instantaneous revocation or DRM guarantee. If confirmation/recovery is uncertain, stop the exact project's read-only `media-origin` to contain new anonymous reads until recovery; preserve its container configuration and every volume. A barrier prevents new writers, not reads, so do not treat an error as proof that the prefix is private.

Do not expire/delete the barrier based on age alone. Inspect the explicit project, stop every `media-publish` container/coordinator, pause editorial commands and prevent new admission, then restart only that project's private `storage` service to fence in-flight requests. With the trusted local S3 client, archive the exact control object and bucket policy in incident evidence. Require recognized immutable prefixes and an intact prior snapshot. Preserve prior grants. For a newly added prefix, either independently verify the exact registered bundle and current approval to retain it, or restore the recorded previous policy (delete the bucket policy only when that snapshot is empty), then read it back. Do not remove a current active publication's grant without resolving its owning Catalog state. Only after proving this state may the operator delete **only** `control/publication-access.lock` and restore the origin. Retry an eligible attestation through full verification. A legacy/malformed lock, unknown policy or uncertain publisher inventory requires investigation, not an unlock. This is operator recovery, not automatic lock takeover or media garbage collection.

Legacy broad `publications/*` policy is rejected by the initializer. Restrict a known retained demo only after verifying every currently exposed registered bundle and its objects; preserve those exact prefixes. New empty projects need no migration. [Recorded Phase 06 migration](../../evidence/phase-06/publication-access.md).

## Replace or roll back an active publication

Apply migration 0008 with the current initializer before these commands. Use the normal local operator, not the attester. Inspect the title and select an existing registered publication ID; neither command accepts a URL or validation flags.

```json
{"command":"replace","input":{"titleId":"00000000-0000-4000-8000-000000000001","mutationId":"00000000-0000-4000-8000-000000000002","expectedVersion":5,"publicationId":"00000000-0000-4000-8000-000000000003","reason":"Activate a validated compatible version"}}
```

This is an input-shape example, not a command for the retained first film. For recovery, use `rollback` with the inspected current version, a new mutation ID and the previously active publication ID. The target must have been active before the current title version, belong to the same title/current rights revision and original checksum, and still satisfy validation/expiry policy. Artwork and editorial metadata stay unchanged. Both operations keep PUBLISHED state and atomically record the new pointer, incremented version, reason/audit, receipt, activation history and title-published event. Current streams may finish on their immutable old URL; no media bytes are rewritten.

Activation history survives outbox delivery. Exact command retries use the same mutation/input within the existing 24-hour receipt window; returned receipts describe the historical command, not current authorization. Missing history, incompatible rights, dispute, cancellation or a stale version leaves the pointer unchanged. Never bypass a rejection with direct SQL. Retire when no compatible version exists. The current first film has only one registered/active bundle, so there is no real prior version to restore yet. [Synthetic rollback evidence](../../evidence/phase-06/rollback.md) does not claim a second film encode.

`pnpm media:origin:test` verifies synthetic copies, replay, MIME/cache, CORS/Range and negative permissions. `pnpm catalog:integration` verifies real PostgreSQL registration/activation/dispute/privilege behavior. [Actual first-film evidence](../../evidence/phase-06/publication.md) is distinct from those synthetic tests.
