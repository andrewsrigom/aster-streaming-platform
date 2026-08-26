# Skill: Security

## Purpose

Apply threat-informed controls without scattering authorization and validation inconsistently.

## Threat review

For each feature identify:

- actor;
- asset;
- entry point;
- trust boundary;
- privilege;
- abuse case;
- control;
- detection;
- recovery.

Review identity spoofing, data tampering, repudiation, disclosure, denial of service, and privilege escalation where relevant.

## Boundary validation

Validate at the first trusted boundary:

- GraphQL inputs;
- headers;
- authentication claims;
- event payloads;
- configuration;
- media metadata;
- object-storage notifications;
- URLs and redirects.

Validation libraries do not replace authorization or business invariants.

## Authorization

Authorization belongs in application policies owned by the context. Resolver directives may invoke policies but may not be the only enforcement point.

Tests must cover:

- unauthenticated;
- wrong account;
- wrong profile;
- inactive resource;
- revoked permission;
- stale token;
- attempted identifier substitution.

## Abuse resistance

For public operations apply layered protection:

- network and request rate limiting;
- body and parser limits;
- operation allowlisting;
- cost and depth limits;
- pagination bounds;
- execution deadlines;
- dependency concurrency limits;
- cache-key normalization;
- safe error responses.

## Secrets

Use environment-specific secret stores. Configuration schemas indicate which values are secret. Redact secrets before logging and validate that client bundles contain no server secrets.

## Media threats

Treat media as hostile input. Avoid shell execution, isolate processing, limit resources, validate outputs, and remove temporary files securely.

## Security evidence

Record negative tests, scanner output, threat model decisions, and incident runbooks. A scanner passing does not prove authorization correctness.
