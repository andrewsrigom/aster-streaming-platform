# Current State

Last updated: 2026-08-27

## Active phase

**Phase 03 — Catalog and Content Rights**

Status: **IN_PROGRESS**

## Verified

- Phases 00–02 are released. PR 19 squash ec6386ca7add0f12ae748589be763d9e90ff0d6c is the main base.
- Protected 33066484199 and post-merge 33066827332 pass: 144 Identity tests, eleven real scenarios, UID 1000, six metric families and Docker local login/profile journey. [Release evidence](../evidence/phase-02/release.txt).
- Phase 02 recorded four healthy retained Aster containers. Catalog tests change only new labelled disposable fixtures, not demo data, unrelated resources or the public remote.

## Current work

P03-R01/R02/R06 are committed through 63e4c7e. P03-R05 is locally verified: published-only SQL reads, complete bounded metadata and Catalog Federation v2. 91 tests and all 52 candidate tasks pass (38 cached, 42.253 s), including ESLint/Knip, secret scan and high-severity audit. Real SQL/CLI/HTTP proves keysets, expiry, one-query entities, immediate retirement and reader isolation; cleanup left zero fixture resources in 18575 ms total. Author initial/confirmation review is complete. [Evidence](../evidence/phase-03/catalog-public.txt). No independent approval or remote release is claimed.

## Not implemented

Real candidate-source rights records, generated HLS fixture and Catalog Docker runtime. Router, web UI, media/playback, engagement/discovery and hosted release remain planned. No playable VOD demo or approved film exists.

## Next outcome

Start READY P03-R04/R09: generated HLS technical fixture, source reviews and Docker Catalog runtime. P03-R05 is complete locally in the coherent source checkpoint. Keep one Phase 03 publication after full phase acceptance.

## Current risks

- Compatible licensing decisions are authorized; retain MIT unless actual compatibility requires change. Preserve notices/terms. No repeated Apollo permission pause.
- High/critical audit passes with the known moderate uuid advisory outside inspected Apollo v1/v4 paths; recheck on upgrades.
- Viewer JWTs are not operator credentials. ADR-0015 uses explicit local process authority and restricted SQL credentials; no hosted operator identity is claimed.
- Rights/provenance/metadata audit are durable and immutable to runtime roles. Catalog receipts/outbox have 64/128 slots per title with a reserved takedown slot; unrelayed events are not evicted. Relay remains Phase 08.
- Domain publication references validate structure, not media bytes. Pre-acquisition checksum can be null; actual rights permission must precede download.
- SQL/CLI evidence covers synthetic local Linux amd64, not actual media, hosted capacity or other operating systems. expire is an explicit command, not a scheduled sweeper.
- Public reads use statement-time rights checks, request-scoped loaders, no-store and no Redis cache. New metadata writes require the expanded decoder; down 0003 alone preserves all product/audit data.
- No broad reset/prune, remote bypass, private motivation in docs or changes to unrelated Dependabot PR 1.
