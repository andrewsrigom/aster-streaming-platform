# Phase 09 Web discovery release

Date: 2026-08-29

Status: released locally through protected and exact post-merge CI

## Release chain

- Pull request: [PR 36](https://github.com/andrewsrigom/aster-streaming-platform/pull/36)
- Corrected exact candidate: `b5ccd59c32261df16e52c74aee746ef6ae4d30fa`
- Protected candidate run: `33253867475`, all required jobs passed
- Initial hosted review: `5058080810` on `b087bc5`; three blocking edge
  findings were corrected together
- Exact-head confirmation: issue comment `5462581837` reviewed `b5ccd59` and
  reported no major issue
- Squash main: `ffe8e243a03b721d551742acd37db9dd645869eb`
- Exact-main run: `33254719311`, all required jobs passed

## Accepted behavior

Public home rails and bounded search are server-rendered through positively
projected request-scoped Apollo state. Profile-specific continue-watching begins
only after browser-side owner confirmation and stays outside public HTML. Invalid
or repeated discovery locales fail before owner work, every partial group is
explicit, and an unusable partial payload cannot suppress the Catalog fallback.
Discovery failure leaves Catalog browse and Playback independent.

## Evidence carried into release

- Web tests: 110/110
- Router tests: 10/10
- Corrected affected candidate: 46/46 tasks
- Corrected disposable browser acceptance: 8/8
- Disposable cleanup: zero containers, networks and volumes
- Dependency audit: zero high/critical findings and one known moderate UUID
  advisory already bounded in the candidate evidence

The detailed browser, artifact, accessibility, failure and limitation record is
in [the candidate evidence](web-discovery-runtime.txt). Search projection and
home-owner evidence remain linked from the [Phase 09 index](README.md).

## Limitations

This release proves the local/integration architecture. It does not claim a
hosted deployment, field SLO, production capacity, recommendation model or new
media rights.
