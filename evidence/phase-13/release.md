# Phase 13 Release

Status: **released**

## Scope

Phase13 closes P13-R01–R12: trusted operations, parser and demand controls,
bounded execution/rate/cache behavior, N+1/query-count proof, owner-side
authorization abuse coverage and safe schema/client delivery.

## Final correction

Source `a99b3af5212e4fb967ed41230c3ca59fa394cca7`, tree
`dc84bbc4cf63b0e8ce977a8f90fbb296f9f6903e`, makes the Discovery and Engagement
federated runners compare the complete observed PostgreSQL owner set with each
operation's exact budget. Only explicitly fingerprinted readiness and fixture-
background statements are excluded by the shared measurement SQL. An unexpected
owner fails the proof before totals are accepted.

Focused query proof5/5, strict Engagement build, both full federated runtimes and
the affected73/73 gate pass. Discovery retains TitleDetail2, Search5 and Home7
with ten distinct Search/Home titles and cleanup0. Engagement retains
ContinueWatching7 with cleanup0.

## Protected acceptance and review

- Evidence head `71823fe18d11832183e6af8acdab2210e7486af4`, tree
  `5d075d0296c862202f3db59d7a276ba6795490b8`, passed protected run
  `33485233911`.
- Result checkpoint `db17bca9154984642d9b11d00d06c5ebd6d31b80`, tree
  `41650b4d0ee4244084e0d0d34d8aa387cda52cc3`, passed protected run
  `33486901296`.
- The final review completed on exact head `db17bca` at
  `2026-09-01T08:50:50Z` without a new finding.
- All six PR57 review threads are resolved. The last discussion,
  `3901909548`, records the complete-owner-set correction and protected proof.

Both protected runs passed source quality, real platform integration, Catalog,
Playback, Engagement and Discovery runtimes, the Docker-only playable demo,
Local platform diagnostics, exact cleanup, documentation/security and aggregate
protection.

## Merge and exact-main acceptance

PR57 squash-merged as `83cb5100408a691da15550194af6763c55170ba7` at
`2026-09-01T08:51:54Z`. Its tree
`41650b4d0ee4244084e0d0d34d8aa387cda52cc3` exactly matches the final candidate
tree.

Exact-main run `33489232182` started at `2026-09-01T08:51:56Z` and completed at
`2026-09-01T09:09:16Z`. It passed:

- source quality and tests;
- real platform integration;
- Catalog, Playback, Engagement and Discovery runtimes;
- the Docker-only playable demo;
- the complete three-scenario Local platform diagnostic and exact cleanup;
- documentation/security, classification and aggregate protection.

## Commands used to verify release state

```text
gh pr view 57 --json state,mergedAt,mergeCommit,headRefOid,url
git fetch origin main
git rev-parse origin/main
git rev-parse origin/main^{tree}
gh run view 33489232182 --json headSha,status,conclusion,createdAt,updatedAt,jobs,url
```

## Limitations and deferred work

These results are local/protected single-run regression evidence, not hosted
capacity or latency objectives. Audit mode remains local/integration only.
Owner authorization remains mandatory even for a trusted document. Hosted
providers, credentials, capacity, identity/TLS, backup/restore and public
deployment remain planned Phase14 P14-R01–R12 work. ADR-0048 activates the
credential-free reference-quality track first.
