# Work Item: Phase 11 retry-ownership confirmation remediation

- Status: IN_PROGRESS
- Owner: Platform Router policy verification
- Phase: 11
- Requirement IDs: P11-R10, P11-R11
- Created: 2026-08-30
- Updated: 2026-08-30

## Outcome

The closeout guard rejects every valid YAML representation of a `retry` key
inside Apollo Router `traffic_shaping`, so Router cannot silently duplicate the
service-owned safe-read retry.

## Current behavior

PR44 exact head `b803d74` passes its local candidate and most protected jobs.
Exact-head confirmation discussion `3888512532` proves that the lexical scanner
does not decode a double-quoted YAML Unicode escape such as `"retr\\u0079"`.
The parser therefore accepts a configuration that Apollo Router reads as a
`retry` mapping. P12-R01 is paused locally until this predecessor is coherent
again; its uncommitted work is preserved in a named Git stash.

## Proposed behavior

Parse the bounded Router YAML with the repository's declared YAML parser,
reject parse errors and aliases, locate `traffic_shaping` structurally, and
recursively reject the decoded key `retry` regardless of block, flow, quote or
escape presentation.

## Boundaries

- Owning context: Platform.
- Affected files: Router source verifier, its focused tests, root development dependency and evidence/state.
- Authoritative data: none.
- Trust boundaries: repository-controlled Router configuration interpreted by both CI and Apollo Router.
- External dependencies: exact `yaml` package version already present transitively in the locked toolchain.

## Invariants

- Safe Catalog read retries remain service-owned and limited to two attempts.
- Router and Web perform no automatic retry.
- The verifier parses at most the existing 32 KiB source limit and rejects malformed or aliased policy input.
- No production request path or product contract changes.

## Failure behavior

| Failure | Expected behavior | Evidence |
|---|---|---|
| Encoded, quoted, flow or block `retry` key | Router source validation fails | focused mutation tests |
| Malformed or aliased YAML | Router source validation fails closed | focused parser tests |
| Valid current configuration | validation remains green | platform verifier test |

## Data and contracts

- Schema/migration: none.
- GraphQL/events/cache: unchanged.
- Compatibility: current Router YAML remains valid; only retry-ownership bypasses are rejected.
- Retention/deletion: none.

## Security and privacy

No request data is parsed. The repository configuration is size-bounded, YAML
aliases are rejected, and failures expose no credentials or runtime values.

## Implementation steps

1. Declare the exact YAML parser dependency.
2. Replace lexical key decoding with structural bounded parsing.
3. Add escaped-key, malformed-document and alias mutation coverage.
4. Run focused Router/platform, static and affected gates.
5. Update evidence/state, publish once and request one exact-head confirmation.

## Tests

- Focused: `tools/verify-router-runtime.test.mjs`.
- Static: scoped ESLint, Prettier and lockfile integrity.
- Candidate: P11 affected-scope gate from the existing closeout plan.
- Hosted: protected PR44 gate and one confirmation on the corrected exact head.

## Evidence

- Raw artifact: `evidence/phase-11/retry-amplification.txt` and release record.
- Iteration gate: focused Router verifier tests.
- Candidate gate: the existing P11 affected gate plus dependency/document checks.
- Heavyweight repeat trigger: Router verifier/tool dependency changes repeat the protected Router/platform gate; unchanged game-day product behavior carries forward.
- Review stopping rule: this confirmed blocking boundary receives one correction and one exact-head confirmation.

## Rollback or recovery

Revert the parser dependency and structural guard together. This changes no
runtime state, but Phase 11 cannot release while the lexical bypass remains.

## Documentation updates

- Phase 11 retry-amplification evidence and release checkpoint.
- Repository current state, queue, session log and handoff.

## Completion checklist

- [x] Structural guard and bypass tests pass
- [x] Affected candidate passes
- [x] Evidence and repository memory are current
- [ ] Protected CI and exact-head confirmation pass
- [ ] PR44 releases before P12 resumes
