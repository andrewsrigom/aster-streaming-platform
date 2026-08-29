# Discovery search protected release

P09-R01, P09-R02, P09-R06 and P09-R07 are released in main commit
`0bdcb275dc354a684342cd3ceb19e11aa1dc0d63`.

- Pull request: [#33](https://github.com/andrewsrigom/aster-streaming-platform/pull/33)
- Exact candidate: `fc353c3d9b9200ab21ea5d3d4b2715e85fe78453`
- Protected exact-head run: [33238473742](https://github.com/andrewsrigom/aster-streaming-platform/actions/runs/33238473742)
- Review: all six discussions were resolved and the final automated confirmation
  reported no major issue on the exact candidate.
- Merge: squash commit `0bdcb275dc354a684342cd3ceb19e11aa1dc0d63` at
  `2026-08-29T06:44:21Z`.
- Exact-main run: [33239191134](https://github.com/andrewsrigom/aster-streaming-platform/actions/runs/33239191134)

Both protected runs completed every job, including the stable `CI required` gate.
The underlying PostgreSQL, Kafka, Router, failure-isolation and cleanup observations
remain in the linked Phase 09 evidence. This release does not claim home rails,
browser integration, hosted operation or load capacity.
