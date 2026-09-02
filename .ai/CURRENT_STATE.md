# Current State

Last updated: 2026-09-02

## Active phase

**Phase 14 — Reference Quality, Capacity Validation, and Hosted Release**

Status: **reference track VERIFIED; hosted track PLANNED and inactive**.
Phases00–13 are released locally. P14-R13–R18 are verified under ADR-0048.
All 75 queue items are `DONE`; no work item is active or ready.

Hosted P14-R01–R12 still requires explicit owner authorization for providers,
credentials, paid resources, and public endpoints. Local reference verification
does not satisfy those requirements.

## Verified

- Phases00–13 retain their linked protected and exact-main acceptance evidence.
- Items68–74 verify the reference-first runway, capability index, readability
  guardrails, representative owner-scoped refactors, rationale comments,
  executable examples, and eight core-journey reading paths.
- Item75/P14-R18 final candidate `662c597986d0edf0885896b1ff42d78f9b59b457`,
  tree `70ef84a88f06dd2b16f5633f2285d9a610b12809`, passed protected workflow
  `33654220663`. Every PR66 discussion is resolved.
- Final review `5092157759` on `7a3279a` found only stale status prose.
  Its correction changed no executable or blocking boundary, so the recorded
  review stopping rule required no further round.
- PR66 squash main `85658dffdf827ce5eaa08f4a43ee82c24a586565` retains the
  exact candidate tree. Exact-main workflow `33654343586` passed.
- Fresh public source `2b6054a` passed absent-target/empty-state checks, the
  complete README bootstrap including `.githooks`, 16 focused Playback checks,
  a clean 73/73 source gate, and the high-severity audit.
- Context-pinned project `aster-reference-pinned-20260902` passed healthy
  startup, browser playback 1/1 in `10.5s`, replay-safe initialization, checked
  teardown, independent zero label-and-prefix residue, and retained-resource
  comparison. Current runner SHA-256 is
  `cba6458212b4937015e41c45530e0c71395f1221398bae84a0fe7edcbe92604e`.

The authoritative chronology is in
[`evidence/phase-14/README.md`](../evidence/phase-14/README.md).
The [local verification note](../docs/00-start-here/REFERENCE_VERIFICATION.md)
states the accepted scope and limitations.

## Current work

No requirement is active. The reference-quality objective is complete.
Do not start another readability sweep, heavyweight proof, hosted phase, or
product extension without a new scoped owner request.

## Verified local capabilities

The local baseline includes:

- guarded sessions and profile ownership;
- rights-aware Catalog ingestion and publication;
- bounded federated GraphQL through Apollo Router;
- public server rendering and accessible HLS playback;
- durable progress, resume, watchlist, and viewing history;
- owner events, idempotent recovery, and explicit Redis degradation;
- search and independent home rails;
- telemetry, executable SLI/SLO rules, alerts, dashboards, and diagnosis;
- a Docker-only generated-media demonstration with project-scoped cleanup.

Use the [capability index](../docs/00-start-here/CAPABILITY_INDEX.md) and
[core-journey reading paths](../docs/00-start-here/CORE_JOURNEY_READING_PATHS.md)
to study an implementation and run its bounded proof.

## Not implemented

- Hosted P14-R01–R12 remains planned and inactive.
- No public deployment, hosted capacity, production uptime, commercial catalog,
  subscriptions, or broader media-rights claim is made.
- The audit passes the high-severity gate but reports one moderate finding.

## Runtime and recovery

Use WSL Git and pinned Node.js `24.19.0` at
`/home/andrews/.local/share/node-v24.19.0-linux-x64/bin`, with pnpm
`11.24.0`. Never use a branch beginning with `codex/`.

A rejected nested-shell cleanup removed 13 unused volumes from the existing
local `aster` project, including PostgreSQL and object-storage data. Their
Docker data cannot be recovered without an external backup. The stopped
`aster-broker-1`, `aster_broker-data`, and `aster_identity-event-trust`
remain. No empty replacement volumes were created.

Later accepted runs used literal disposable project names, refused remote
Docker overrides and unlabeled name collisions, pinned the inspected local
context including nested Docker work, and proved zero owned residue without
changing the retained resources. The raw acceptance transcript records every
removed volume and rejected attempt.

## Current risks

- The 13 removed local volumes are lost unless an actual external backup exists.
  Recreating empty names would hide, not recover, their former data.
- Generated technical media is not a licensed commercial catalog.
- Verified local behavior must not be represented as hosted production or
  measured production capacity.

## Next outcome

No `READY` work remains. The owner can use the repository for study and
reference, or explicitly authorize a new bounded change. Hosted work remains
inactive; no credentials, paid resources, public endpoints, or media rights may
be inferred from this closeout.
