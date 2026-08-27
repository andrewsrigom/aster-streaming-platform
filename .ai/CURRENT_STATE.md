# Current State

Last updated: 2026-08-27

## Active phase

**Phase 03 — Catalog and Content Rights**

Status: **IN_PROGRESS**

## Verified

- Phases 00–02 are released. PR 19 squash ec6386ca7add0f12ae748589be763d9e90ff0d6c is the main base.
- Protected 33066484199 and post-merge 33066827332 pass: 144 Identity tests, eleven real scenarios, UID 1000, six metric families and Docker local login/profile journey. [Release evidence](../evidence/phase-02/release.txt).
- The four retained Aster containers remain healthy. No demo data, unrelated resources or public remote changed during the Catalog slices.

## Current work

P03-R01/R02 are committed at 4968d42/12db9fb. P03-R06 on feat/p03-catalog-rights is locally verified: authorized editorial commands, localized metadata, independent artwork review, immutable audit, receipts/outbox and guarded local CLI. 74 tests and real PostgreSQL/CLI pass; both publish/dispute lock orderings, atomic failures, full-capacity takedown and the ten-second stdin deadline are proven. Author review/confirmation and all 52 candidate tasks pass (40 cached, 20.936 s). No independent approval or remote release is claimed. [Evidence and completed plan](../evidence/phase-03/catalog-workflow.txt).

## Not implemented

Public Catalog browse/schema, real rights records, generated HLS fixture and Catalog Docker runtime. Router, web UI, media/playback, engagement/discovery and hosted release remain planned. No playable VOD demo or approved film exists.

## Next outcome

Activate READY P03-R05 public browse/detail and Federation schema with a new bounded change plan. P03-R06 is complete locally in this coherent source checkpoint. Keep one Phase 03 publication; actual technical fixture and candidate-source review remain required before phase release.

## Current risks

- Compatible licensing decisions are authorized; retain MIT unless actual compatibility requires change. Preserve notices/terms. No repeated Apollo permission pause.
- High/critical audit passes with the known moderate uuid advisory outside inspected Apollo v1/v4 paths; recheck on upgrades.
- Viewer JWTs are not operator credentials. ADR-0015 uses explicit local process authority and restricted SQL credentials; no hosted operator identity is claimed.
- Rights/provenance/metadata audit are durable and immutable to runtime roles. Catalog receipts/outbox have 64/128 slots per title with a reserved takedown slot; unrelayed events are not evicted. Relay remains Phase 08.
- Domain publication references validate structure, not media bytes. Pre-acquisition checksum can be null; actual rights permission must precede download.
- SQL/CLI evidence covers synthetic local Linux amd64, not actual media, hosted capacity or other operating systems. expire is an explicit command, not a scheduled sweeper.
- No broad reset/prune, remote bypass, private motivation in docs or changes to unrelated Dependabot PR 1.
