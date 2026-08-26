# Work Item: Remediate local reset upgrade compatibility

- Status: IN_PROGRESS
- Owner: repository maintainer
- Phase: 01
- Requirement IDs: P01-R02
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

Make the destructive reset safely handle the exact P01-R01 local resources that predate service-level Aster labels, while refusing physically Aster-prefixed resources that are hidden from project-label discovery.

## Current behavior

Implementation commit `3fa3994` passes fresh-state reset evidence, but review comment `3861318803` proves that existing P01-R01 containers have exact Compose ownership labels without the new `com.aster.environment` and `com.aster.scope` labels. The current equality check refuses those containers. Manual review also found that an Aster-prefixed resource with a missing project label is invisible to the label-only discovery and can produce a false empty-state result.

## Proposed behavior

Accept a service container only when project, service, and absolute Compose-file labels are exact and its Aster label pair is either the complete current `local|platform` pair or the complete legacy empty pair. Reject partial or different Aster labels. Preflight Aster-prefixed container, network, and volume names and refuse any whose project label is not exactly `aster` before using project-label discovery. Preserve every other reset control and postcondition.

## Boundaries

- Owning context: local platform operations; no product bounded context changes.
- Affected services/packages: reset script and tests, platform policy, P01-R02 evidence, operator documentation, and repository memory.
- Authoritative data: only the current local PostgreSQL volume after confirmation.
- Read models/caches: local disposable Redis state.
- Trust boundaries: pre-existing Docker names and labels, current Compose labels, command environment, and Docker context.
- External dependencies: supported local Docker Engine and Compose only.

## Invariants

- Project, logical service, absolute Compose file, service allowlist, resource counts, and all existing network and volume labels remain exact.
- Only the complete current service-label pair or complete absent legacy pair is accepted; partial or unexpected values fail closed.
- Aster-prefixed physical resources without exact project ownership fail closed and are never deleted.
- No broad cleanup, hosted target, image removal, or unrelated-resource mutation is introduced.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Exact legacy service labels | Continue to the same confirmed scoped teardown | Bounded success output and zero postconditions |
| Partial or different service labels | Refuse before teardown | Container name and label-class diagnostic without data values |
| Aster-prefixed resource lacks exact project label | Refuse before label-filtered discovery | Resource kind and name only |
| Existing reset refusal or teardown failure | Preserve current fail-closed behavior | Existing bounded diagnostics |

## Data and contracts

- Schema/migration: none.
- GraphQL: none.
- Events: none.
- Cache: no change.
- Compatibility: add backward compatibility only for the exact released P01-R01 container-label shape.
- Retention/deletion: unchanged confirmed local deletion contract.

## Security and privacy

- Authorization: unchanged local Docker access plus explicit local marker and confirmation.
- Input limits: unchanged fixed arguments and no target input.
- Sensitive data: no label value, URL, credential, or stored data is printed.
- Abuse cases: partial-label spoofing, missing project labels, prefix collisions, legacy upgrade failure, and false empty state.

## Implementation steps

1. Add prefix ownership preflight and exact legacy/current service-label compatibility.
2. Extend fake-Docker and static adverse coverage without weakening existing cases.
3. Reproduce P01-R01 startup and P01-R02 reset from the same clean public checkout path.
4. Update evidence and repository memory, pass all gates, reply to and resolve review, and repeat protected CI.

## Tests

- Domain: not applicable.
- Application: not applicable.
- Integration: public `main` P01-R01 startup, same-checkout switch to corrected branch, exact reset, zero postconditions, unrelated-state preservation.
- Contract: exact legacy success; missing-project prefix refusal; partial-label refusal; all existing reset cases.
- Browser: not applicable.
- Performance/failure: measure upgrade reset duration and preserve bounded failure behavior.

## Evidence

- Commands: focused tests, real same-checkout upgrade, complete forced gate, Compose parse, audit, protected CI and review query.
- Raw artifact path: `evidence/phase-01/local-reset.txt`.
- Acceptance result: remediation pending.

## Rollback or recovery

Revert the remediation before merge if it weakens ownership checks or cannot prove the same-checkout upgrade. Keep the existing resources untouched on every refusal; do not use manual or broad cleanup as a workaround.

## Documentation updates

- `docs/operations/LOCAL_DEVELOPMENT.md`
- `evidence/phase-01/local-reset.txt`
- `.ai/CURRENT_STATE.md`
- `.ai/SESSION_LOG.md`
- `.ai/HANDOFF.md`

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
