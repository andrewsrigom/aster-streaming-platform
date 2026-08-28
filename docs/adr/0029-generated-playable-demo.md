# ADR-0029: Docker-only generated playable demo

- Status: Accepted
- Date: 2026-08-28
- Requirements: P07-R12, P07-R03, P07-R05

## Decision

Extend ADR-0016's source-owned six-second technical fixture to real local delivery, without changing its original non-delivery browse seed. A separate fixed title, Signal / 02, uses the same generated color/tone and authored English captions. It is not an acquired film or evidence of film rights. The unchanged recipe and MIT attribution remain explicit; FFmpeg is a separate pinned tool with its existing notices.

A network-disabled, bounded one-shot generator exports only its eight verified files and a completion report to a project-scoped volume. It checks reproducibility, decode, size, hashes and local playlist references before completion. Reuse requires the same generator/contract checksum and complete matching bytes; conflicting retained output is refused, never overwritten. This report describes computation, not approval, and does not claim its own container image digest.

A Catalog-owned, explicitly local initializer validates that inventory again, follows the existing create/review/media-ready/publish workflow, and records a narrowly scoped technical attestation. Its authority admits only the fixed generated title, actor, source checksum and content-addressed manifest computed from the reviewed recipe. It cannot select a film, arbitrary URL or another owner. Its migration credential is confined to this one-shot initializer, never Web or the Catalog reader. Existing modified or retired titles are refused.

Reuse the existing private S3 writer and read-only origin (ADR-0026). Upload immutable children before the master, verify every object, and grant only the complete content-addressed prefix using the existing publication barrier/compensation protocol. Recheck current rights under a title lock when registering the attestation. The original and report remain outside the anonymous prefix. Existing grants and data are preserved. Replay verifies bytes and authority again; it cannot undo a takedown. This is a fixed source-owned technical bootstrap, not a general ingestion endpoint or a replacement for film processing/attestation.

The playable overlay reuses the existing Web and origin definitions and adds only the finite generation/seed jobs. Compose waits for successful initialization and healthy dependencies before exposing the journey. Start from empty project volumes using one Docker command; no host Node, FFmpeg, SQL, account or hosted credentials. Optional Identity, Redis, broker and observability are not prerequisites. No global cleanup, port-killing or retained-development reset is part of startup.

## Verification and recovery

Focused tests cover inventory/path/hash corruption, missing/partial files, cancellation, immutable replay, fixed authority, changed/retired seed, and partial publication. One disposable clean-project run covers build, initialization, actual browser frame/captions, direct origin traffic, private/listing denial, restart idempotency, diagnostics and exact cleanup. Record images, commands and resource limits; cached build layers are not a cold-download benchmark. The retained film is neither downloaded nor encoded again.

On failure inspect the named generator/seed logs and retain data. Ambiguous access changes use ADR-0026's fenced recovery. Stop/remove only the exact demo project after checking ownership; normal stop retains volumes. Reverting the overlay leaves the original browse checkpoint available. Never automatically delete a conflicting fixture or publication.

## Sources

Docker documents [successful initialization and health dependencies](https://docs.docker.com/compose/how-tos/startup-order/) and [selective service reuse with extends](https://docs.docker.com/compose/how-tos/multiple-compose-files/extends/). The actual resolved model and runtime, not this documentation alone, establish compatibility.
