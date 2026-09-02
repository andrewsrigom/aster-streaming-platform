# Local Reference Verification

Status: **in progress — fresh local acceptance passes; protected release pending**

This checkpoint answers one bounded question: can a reader clone Aster, find a
capability, inspect how it is implemented, run its focused proof, and exercise
the documented local reference journey without hosted infrastructure?

It does not publish Aster or make a production-readiness claim.

## Verified from a fresh checkout

Fresh clone `/tmp/aster-reference-reader-boundary-20260902` uses public main commit
`2b6054a6ff30b24e635b2aae830850455cdcc8b6`, tree
`3e905ea5d3c18de426918125fbc6dbb0de310bd7`.

- The target path is proved absent before `git clone`.
- Before installation, ignored files, untracked files, `node_modules`, `.turbo`,
  `dist`, and `coverage` directories are all absent.
- Node.js `24.19.0`, Corepack, pnpm `11.24.0`, and local hook path `.githooks`
  follow the complete README bootstrap.
- The frozen install accepts the lockfile and installs all 18 workspace
  projects without downloads from an already populated package cache.
- The toolchain check accepts the active versions and repository pins.
- The [capability index](CAPABILITY_INDEX.md) leads from Playback behavior to
  its requirement, service and Web source, adverse tests, release evidence,
  and operations guide.
- The selected Playback application and Web-state checks pass 16/16.
- The accepted clean complete source gate passes 73/73 tasks in `52.379s`.
- The high-severity dependency audit exits successfully with one moderate
  finding.

The [raw acceptance transcript](../../evidence/phase-14/p14-r18-reference-acceptance.txt)
records the exact source and Docker results.

## Verified Docker reference journey

The accepted endpoint-corrected Docker attempt uses Engine `26.0.0`, Compose
`2.26.1-desktop.1`, inspected local Linux context `default`, and the unique
literal project `aster-reference-endpoint-20260902`.

- Docker context verification includes 24 reviewed paths and excludes 18
  private or generated canaries.
- Docker endpoint/configuration overrides and non-local endpoints are refused.
  Every Docker and Compose operation is pinned to the inspected context.
- Ports `3000`, `4000`, and `9001` are free before startup. Every container,
  network, and volume inventory query must succeed and report an empty exact
  namespace before teardown is armed. Physical project-name prefixes are also
  checked so missing labels cannot hide a collision.
- The anonymous Web, Router, Catalog, Playback, PostgreSQL, object-storage, and
  generated-media path becomes healthy.
- The existing real browser journey passes 1/1 in `3.9s`, playing HLS with
  captions and direct media delivery.
- Repeated startup records `changed:false` for the Catalog seed and
  `generated_hls_reused` for the exact 1,948,485-byte technical fixture.
- Cleanup first inspects the exact project, then removes its containers, two
  networks, and 13 volumes. It checks the status of Compose teardown and every
  inventory query before accepting the label-query proof of zero owned residue.
- Independent post-run queries confirm zero project resources and preserve the
  stopped `aster-broker-1`, `aster_broker-data`, and
  `aster_identity-event-trust` resources.

The safety boundary is exercised separately: a hostile `DOCKER_HOST` is refused
before Docker access, and an unlabeled project-prefixed fixture volume is
refused and preserved before teardown is armed. The fixture is then removed by
its exact synthetic name.

The accepted attempt uses generated technical media, no credentials, no
external film, and no hosted resource.

## Non-accepted attempts and host impact

The initial Docker preflight failed before Compose because Docker Desktop could
not remove a stale local analytics socket. The owner reopened Docker, and the
engine then became healthy without a factory reset or socket mutation.

A later non-accepted cleanup command passed a project variable through a nested
shell. The outer shell expanded it to an empty value, so Compose fell back to
the existing local `aster` project and removed these 13 unused volumes:

- `aster_catalog-router-trust`;
- `aster_discovery-catalog-trust`;
- `aster_discovery-router-trust`;
- `aster_engagement-catalog-trust`;
- `aster_engagement-identity-trust`;
- `aster_engagement-playback-trust`;
- `aster_engagement-router-trust`;
- `aster_identity-router-trust`;
- `aster_playable-fixture`;
- `aster_playback-catalog-trust`;
- `aster_playback-router-trust`;
- `aster_postgres-data`;
- `aster_storage-data`.

Docker volume data is not recoverable without an external backup. The stopped
`aster-broker-1` container, `aster_broker-data`, and
`aster_identity-event-trust` remain. No replacement volumes were created to
hide the loss.

This command was not part of the documented reader path, whose cleanup uses a
literal project name. The attempt is rejected. The accepted corrected repeat
uses a script-owned literal project from preflight through fail-closed
postcondition checks; the remaining `aster` resources are unchanged before and
after that repeat.

Two source-gate observations are also rejected as complete acceptance. One
attempt hit the media process-group timing assertion; the focused test then
passed 2/2. A second invocation overlapped the still-running first gate and was
rejected by the Next.js build lock. After all prior processes ended, the clean
73/73 gate above passed.

## Remaining release work

The fresh local path passes. P14-R18 remains in progress until the corrected
evidence candidate completes protected review, merge, and exact-main
acceptance.

Earlier protected and exact-main workflows prove the same checked-in playable
path on CI infrastructure. They support the implementation claim but do not
replace the recorded fresh-reader checkpoint.

## Verified local scope

The checked-in evidence supports a local reference implementation of:

- profile ownership and bounded sessions;
- rights-aware Catalog ingestion and publication;
- federated GraphQL with bounded execution and request-scoped batching;
- server-rendered browsing, accessible HLS playback, and local player state;
- progress, history, watchlist, events, degradation, and recovery;
- search, independent home rails, telemetry, SLOs, alerts, and diagnostics;
- a generated technical media sample that exercises the local video path.

Use the [capability index](CAPABILITY_INDEX.md) for owner, source, test,
evidence, and operations links. Use the
[core-journey reading paths](CORE_JOURNEY_READING_PATHS.md) to study one
end-to-end behavior with a bounded executable check.

## Explicit limits

This checkpoint does not claim:

- a public URL, hosted environment, deployment, production release, or uptime;
- measured hosted load, spike, soak, capacity, cost, or scaling behavior;
- a licensed commercial catalog or rights beyond each recorded local fixture;
- paid providers, credentials, backups, restore drills, or hosted rollback;
- commercial viability, audience demand, or investor readiness.

Hosted Phase 14 requirements P14-R01–R12 remain planned and inactive. Their
activation still requires explicit provider, credential, resource, cost, and
owner decisions.
