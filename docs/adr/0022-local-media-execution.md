# ADR-0022: Finite Catalog Media Execution and Immutable Originals

- Status: Accepted
- Date: 2026-08-28
- Requirements: P06-R01–R04, P06-R06, P06-R10, P06-R12
- Scope: reversible, local Phase 06 execution under the standing authorization

## Decision

Use a finite Catalog-owned coordinator, separate from HTTP request serving, to acquire an accepted media request. It receives the existing local operator authority and Catalog/S3 credentials, never caller-selected URLs, paths or commands. PostgreSQL owns attempts and results. The coordinator handles opaque bytes; decoding will run in a separate network-disabled, resource-limited job without database/storage credentials or a Docker socket. It is a worker capability, not a sixth bounded context or new hosted service.

Acquisition will admit one active attempt globally, at most three attempts per request, with an eight-minute non-renewable lease and a shorter seven-minute process deadline. Claiming, retiring an expired attempt and completing a result are short transactions. The same slot-lock/title-lock order prevents contradictory claims; attempt IDs and expiry fence late completion. No transaction stays open during network or filesystem work. Cancellation and failed attempts retain audit; a dead process can be retried after its lease expires without accepting its late result.

Check current rights before acquisition, during execution at a bounded interval and before completion. A database/authority failure cancels work rather than extending permission. Dispute can race bytes already in flight: periodic checking bounds that exposure but does not assert instantaneous remote cancellation. No acquired original, stale attempt or caller-provided report is a publication attestation. Catalog publication still requires a separate verified-result handoff and current-rights transaction.

The first source is an exact approved HTTPS URL on the official source host. Resolve and pin a public address, preserve TLS hostname verification, reject private/reserved destinations and redirects, and send the stored strong ETag as If-Match. Reject content encoding, wrong representation, oversized or stalled responses. Stream through byte/signature/checksum validation into an exclusively created owned temporary file; never buffer the complete film. Record actual checksums, elapsed time, bytes and bounded resource samples. Retries never silently change source identity.

Store the verified original under a private SHA-256-addressed key. Extend the existing S3 adapter with conditional single-object PUT, If-None-Match `*` and an explicit full-object SHA-256. This avoids multipart completion/abort ambiguity for create-only writes; ordinary existing multipart writes remain unchanged. A conflict is not proof that matching content exists: verify the retained object's bytes before reusing it. A timeout/uncertain PUT may leave a private immutable orphan, never an active publication; retries use the same content key. Do not overwrite or broadly delete originals.

The pinned VersityGW 1.7.0 POSIX backend checks PUT preconditions before streaming the body, without a per-key commit lock. A real disposable test with two writers and different checksummed bodies returned two successes. Configure its native POSIX concurrency to one in both local and integration Compose: the backend action slot then covers the precondition and complete write. Retain the conflicting-writers regression test. This deliberately limits local storage throughput; there must be one gateway instance, no direct filesystem writer and no public storage credentials. It is not a multi-gateway or hosted atomicity claim. Phase 14 must verify atomic conditional writes for the selected hosted origin rather than copy this local workaround blindly.

## Limits and authority

Use one source/attempt per process, a 256 MiB source limit, bounded HTTP buffers, five-minute source deadline, explicit headers/idle/connect deadlines, existing bounded S3 operations and owned temporary disk limits. Local Docker packaging will enforce CPU, memory, PID and temporary-storage limits before the real-film experiment. These are operational bounds, not performance promises under arbitrary host load.

Only the finite acquisition job joins both the existing internal platform network and a separate media-egress bridge. The internal network alone cannot resolve/reach public sources; do not remove its isolation or expose database/storage ports to fix acquisition. The job has no inbound port and still pins an approved public destination. Decoding remains a separate network-disabled job. Local acquisition is capped at one CPU, 512 MiB memory, 128 MiB Node heap, 64 PIDs and 300 MiB temporary storage.

Attempt persistence is additive with no editorial backfill. Only the owner coordinator writes its attempt state; original request audit remains immutable. Do not add worker publication grants here. Empty-only down migrations preserve retained audit; otherwise roll forward. The broker relay remains Phase 08 and hosted execution identity remains Phase 14.

## Verification and references

Verify real conditional-write conflict, unchanged retained bytes, checksum rejection, early server rejection, cancellation and zero leaked multipart uploads. Exercise source deadlines, changed identity, unsafe destinations/redirects, size/signature/checksum rejection, stream backpressure and owned cleanup. Test durable claims, lease recovery, stale completion and rights races against PostgreSQL before acquiring the first film.

Sources: [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html), [Node DNS resolver cancellation](https://nodejs.org/docs/latest-v24.x/api/dns.html#resolvercancel), [Catalog request authority](0021-catalog-media-requests.md). The pinned AWS lib-storage 3.1118.0 implementation spreads conditional parameters into multipart completion, but its completion rejection is outside the part-upload cleanup path; this design uses conditional PutObject instead of assuming aborted multipart cleanup.

Pinned gateway sources: [POSIX PutObject and action slot](https://github.com/versity/versitygw/blob/v1.7.0/backend/posix/posix.go), [native concurrency option](https://github.com/versity/versitygw/blob/v1.7.0/cmd/versitygw/posix.go).
