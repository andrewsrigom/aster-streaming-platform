# Security Policy

## Security model

Aster is an internet-facing media application. The security model assumes that clients, GraphQL documents, authentication artifacts, uploaded metadata, event payloads, object-storage callbacks, and media files can be malicious or malformed.

Security controls must exist at multiple layers. A client-side restriction is never an authorization control.

## Reporting

Do not publish vulnerabilities, exploit details, credentials, personal data, or unrestricted signed media URLs in a public issue or pull request. Until a dedicated private reporting channel exists, retain the minimum report privately and wait for the repository maintainer to publish a verified private channel. Repository maintainers configure and audit GitHub private vulnerability reporting during public-repository governance and before any public deployment.

Public bug and proposal templates redirect security-sensitive reports here. That redirect is implemented locally; private vulnerability reporting remains planned until the public repository setting is enabled and observed.

## Core controls

### Identity and authorization

- Use standards-based authentication through the selected identity adapter.
- Validate issuer, audience, signature, expiry, and required claims.
- Keep browser sessions in secure, HTTP-only cookies.
- Enforce profile and resource authorization in owning services.
- Do not trust user, profile, role, or entitlement headers from public clients.
- Use short-lived service credentials and rotate signing keys.

### GraphQL

Hosted environments must enforce:

- trusted or persisted operations for first-party clients;
- request-body size limits;
- parser token limits;
- depth, alias, and list-size limits;
- cost or complexity budgets;
- execution deadlines;
- request and operation concurrency limits;
- rate limits partitioned by appropriate identity;
- bounded pagination;
- introspection policy appropriate to the environment;
- CSRF and CORS protections;
- sanitized errors.

DataLoader caches must be request-scoped to prevent cross-user data leakage.

### Media processing

- Verify file signatures and media streams; do not trust extensions.
- Reject unsupported codecs, excessive dimensions, unexpected stream counts, and unreasonable durations.
- Run FFmpeg in an isolated worker with CPU, memory, disk, process, and execution limits.
- Use argument arrays rather than shell interpolation.
- Keep originals private.
- Publish only validated outputs.
- Generate manifests server-side.
- Do not expose unrestricted object-storage credentials or permanent signed URLs.

### Application runtime

- Use strict input schemas at every boundary.
- Apply deadlines and cancellation to outbound calls.
- Bound queues, buffers, fan-out, and concurrency.
- Use parameterized SQL.
- Keep secrets out of logs, traces, errors, and client bundles.
- Fail closed for authorization and rights checks.
- Fail safely for optional personalization dependencies.

### Supply chain

- Pin dependency versions through the lockfile.
- Review install scripts and new transitive dependencies.
- Run dependency, secret, container, and source scanning in CI.
- Generate a software bill of materials for releases.
- Verify container provenance when the delivery platform supports it.

The Phase 00 repository currently enforces exact lockfile installation, immutable GitHub Action commits, read-only workflow permissions, dependency-change review, high-severity registry audit, and bounded redacting secret scans through the staged hook, local gate, and configured CI workflow. Local verification is recorded in [`evidence/phase-00/ci-security-foundation.txt`](evidence/phase-00/ci-security-foundation.txt). Hosted workflow, secret-scanning, push-protection, and repository-setting results are not claimed until the public remote is created and audited.

## Sensitive data

Do not store more personal data than the product requires. Use synthetic data in fixtures and evidence. Define retention and deletion behavior before collecting analytics beyond operational telemetry.

## Security acceptance

Security-sensitive work is not complete until threat assumptions, authorization checks, negative tests, audit events, and operational response are documented.
