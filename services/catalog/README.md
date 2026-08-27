# Catalog

Status: implemented rights-aware editorial application, immutable PostgreSQL history, local operator CLI and metadata/localization. Public browse/Federation, real media validation and Docker Catalog runtime remain planned.

## Local operator

[ADR-0015](../../docs/adr/0015-local-catalog-operator.md) separates the operator from viewer JWTs. The OS user controlling this explicitly local process and its database credentials is the operator. JSON cannot select an actor, assign a role or create the in-process authority. Hosted activation is rejected; this is not hosted authentication or same-process sandboxing.

Use pinned Node/pnpm in WSL/Linux and a deliberately provisioned local PostgreSQL 18.6 database named aster. The retained Compose database is private; these commands do not expose its port or reset it. The following URLs assume a separate database listening at loopback 5432 with the documented test-only administrator password.

~~~sh
pnpm exec turbo run build --filter=@aster/catalog
export ASTER_ENVIRONMENT=local
export ASTER_CATALOG_OPERATOR_ENABLED=true
export ASTER_CATALOG_ADMIN_DATABASE_URL='postgresql://aster@127.0.0.1:5432/aster'
export ASTER_CATALOG_ADMIN_DATABASE_PASSWORD='aster-test-only'
pnpm --filter @aster/catalog migrate:local
unset ASTER_CATALOG_ADMIN_DATABASE_URL ASTER_CATALOG_ADMIN_DATABASE_PASSWORD
export ASTER_CATALOG_DATABASE_URL='postgresql://aster_catalog_local@127.0.0.1:5432/aster'
export ASTER_CATALOG_DATABASE_PASSWORD='aster-test-only'
pnpm --filter @aster/catalog operator < services/catalog/examples/create-draft.json
~~~

The finite initializer applies migrations once and creates a restricted local login. Never use the example password outside the isolated local environment. Password variables are secret-classified and never logged; URLs reject embedded credentials and query options. Operator input is one UTF-8 JSON envelope, at most 65536 bytes, with command and input fields. One process handles one command; its ten-second deadline includes waiting for stdin. PostgreSQL connection/statement deadlines are one second, transaction deadline three seconds. SIGINT/SIGTERM cancel pending work and close resources.

The [draft example](examples/create-draft.json) is executable but deliberately has unresolved rights and cannot be approved. Commands return a JSON status/result, exit zero only on completion and emit sanitized correlated logs to stderr. Trace IDs provide correlation, not proof of exported spans or a dashboard.

| Command | Required input beyond titleId | Behavior |
|---|---|---|
| inspect | None | Read lifecycle, current version and latest rights revision; no audit mutation |
| create | mutationId, expectedVersion: 0, metadata, rights | Create draft and first immutable facts; returns version 2 |
| edit | mutationId, expectedVersion, metadata, rights | Replace draft metadata with a new unreviewed rights revision |
| review | mutationId, expectedVersion, decision, reason | approve, clarify or reject; actor/time are supplied by the owning application |
| media-ready | mutationId, expectedVersion, publicationId | Resolve an existing trusted title/revision-bound technical attestation |
| publish | mutationId, expectedVersion | Recheck current rights, artwork and selected media; append publication event |
| retire | mutationId, expectedVersion, reason | Retire any non-retired title and append retirement event |
| dispute | mutationId, expectedVersion, reason | Append disputed rights and retire atomically |
| expire | mutationId, expectedVersion, reason | Reject unless validUntil has passed; append expired rights and retire |
| reopen | mutationId, expectedVersion | Return retired title to draft; require new edited/reviewed facts before reuse |

Identifiers are lowercase UUIDv4. Reasons are 1–512 characters. inspect can recover the current version after an explicit conflict. For example, pipe this JSON to the operator command:

~~~json
{"command":"inspect","input":{"titleId":"00000000-0000-4000-8000-000000000001"}}
~~~

A missing or mismatched idempotency receipt returns a conflict for stale versions. An exact same-actor/key/input retry replays the prior result for 24 hours without another audit/event. The result describes that command, not necessarily the latest title state. Do not blindly retry indeterminate commits with a new key: retry the identical request or inspect first. After receipt expiry, stale versions still prevent duplicate effects. No implicit retry runs inside the application.

## Rights, metadata and lifecycle

DRAFT → RIGHTS_REVIEWED → MEDIA_READY → PUBLISHED → RETIRED. Retirement works from every non-retired state. Reopening clears the publication pointer but retains the last review revision as a floor; a newer approval is required.

Create/edit accept rights facts, never id, titleId, revision, status, reviewedAt or reviewedBy. Approval requires complete creator/holder/source/asset/license/attribution/modification/third-party/trademark fields, explicit permissions and 1–8 evidence references. The initial use policy requires commercial, redistribution and modification permission, no share-alike obligation and no incompatible technical restrictions. Unsupported share-alike policy is not a claim that those licenses are inherently incompatible.

A source checksum can be null before acquisition: rights permission must precede download. media-ready/publish require an owner-held publication attestation with checksum, validation report, exact title/review linkage and compatible validation time. The runtime cannot insert/update/delete attestations; no CLI command registers media or accepts a validated flag. SQL test attestations are synthetic, not proof that media bytes exist.

Metadata has up to four localizations, eight unique genre slugs and sixteen credits. Titles/synopses are bounded to 160/1024 characters. Locale tags are canonicalized; fallback is exact locale, then lexically first same-language locale, then the declared default. Artwork is optional and has independent rights facts; the review command reviews both assets, verifies the artwork URL matches its source and preserves immutable metadata/review snapshots in command audit.

Public-eligibility rules recheck rights/expiry and publication consistency. The public read path is not yet implemented. expire is an explicit operator command, not a background expiry scheduler.

## Atomicity and limits

Per-title PostgreSQL locking serializes publication/dispute with optimistic versions. A stale contender must inspect and explicitly resubmit; it cannot silently overwrite the winning change. Title, rights/provenance, metadata audit, receipt and publish/retire outbox commit together. Cancellation, denied authority, expiry during publication and failures roll everything back.

Receipts have 64 slots/title; pending outbox has 128. Normal commands stop at 63/127, reserving the last slot of each resource for retirement/dispute/expiry. Pending events and audit are never evicted. A full outbox requires the Phase 08 relay; do not delete events to bypass backpressure. Successful commands prune only expired receipts for their title. Rights and metadata source JSON are limited to 30000 UTF-8 bytes each; stored JSONB to 32768.

See [migration and recovery](migrations/README.md). No public remote or retained demo schema is changed by the test runner.

## Verification

~~~sh
pnpm exec turbo run build --filter=@aster/catalog
pnpm --filter @aster/catalog test
pnpm catalog:integration
~~~

Integration uses the existing pinned PostgreSQL image and deletes only its new, labelled, tmpfs-only fixture. It proves both lock orderings of publish/dispute, rollback after outbox writes, replay, receipt expiry, reserved retirement capacity, forbidden privileges, Unicode/artwork history, migration round-trips and real CLI processes including stdin deadline. [Evidence](../../evidence/phase-03/README.md) distinguishes local acceptance from remote release. No film is approved or playable by these tests.
