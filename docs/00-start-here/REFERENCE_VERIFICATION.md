# Local Reference Verification

Status: **in progress — source path verified, fresh Docker journey pending**

This checkpoint answers one bounded question: can a reader clone Aster, find a
capability, inspect how it is implemented, run its focused proof, and exercise
the documented local reference journey without hosted infrastructure?

It does not publish Aster or make a production-readiness claim.

## Verified from a fresh checkout

Fresh clone `/tmp/aster-reference-reader-20260902` uses public main commit
`2b6054a6ff30b24e635b2aae830850455cdcc8b6`, tree
`3e905ea5d3c18de426918125fbc6dbb0de310bd7`.

- Node.js `24.19.0`, Corepack, and pnpm `11.24.0` follow the README bootstrap.
- The frozen install accepts the lockfile and installs all 18 workspace
  projects without downloads from an already populated package cache.
- The toolchain check accepts the active versions and repository pins.
- The [capability index](CAPABILITY_INDEX.md) leads from Playback behavior to
  its requirement, service and Web source, adverse tests, release evidence,
  and operations guide.
- The selected Playback application and Web-state checks pass 16/16.
- The complete source gate passes 73/73 tasks in `1m47.705s`.
- The high-severity dependency audit exits successfully with one moderate
  finding.

The [raw acceptance transcript](../../evidence/phase-14/p14-r18-reference-acceptance.txt)
records the exact source results and the current Docker diagnostic.

## Remaining verification

Docker Desktop failed before Compose startup because its local analytics socket
could not be removed. The owner closed Docker. No Compose project started, no
factory reset or socket removal was attempted, and no Docker result is claimed
from that attempt.

P14-R18 remains in progress until a healthy local Docker engine proves:

1. the anonymous playable demo starts under a unique explicit project name;
2. the existing browser journey reaches real playback;
3. repeated startup reuses the seed and generated media safely;
4. inspected project-scoped cleanup removes every owned container, network, and
   volume while leaving unrelated resources untouched;
5. protected review, merge, and exact-main acceptance pass.

Earlier protected and exact-main workflows prove the same checked-in playable
path on CI infrastructure. They support the implementation claim but do not
replace this fresh-reader local checkpoint.

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
