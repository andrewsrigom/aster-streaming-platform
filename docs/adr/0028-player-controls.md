# ADR-0028: Client-only HLS.js with Media Chrome controls

- Status: Accepted
- Date: 2026-08-28
- Related requirements: P07-R04–P07-R11

## Context

Aster needs accessible controls without maintaining a complete widget system. Session authority remains in Playback; bytes flow directly from the origin. SSR must remain deterministic and browsing must not load the player bundle.

## Decision

Use HLS.js 1.7.1 (Apache-2.0) with Media Chrome 4.19.2 (MIT), exact pins verified from their npm metadata on this date. Use the React wrappers inside a client-only lazy boundary and an ordinary HTML video element. Aster owns the adapter, finite failure classification, cancellation/expiry, buffer/retry bounds, local preferences and QoE. Preserve upstream notices in the existing Web packaging inventory. No vendor account, analytics service, paid license or media element framework is introduced.

The inspected React bridge ce-la-react 0.3.2 is BSD-3-Clause and supports React >=17. Preserve its Google copyright and notice alongside Media Chrome's Mux MIT notice and HLS.js Apache-2.0 license. All three fit the existing policy; Aster-authored materials remain MIT.

Media Chrome owns play/pause, seek, mute/volume, rate and fullscreen. Aster supplies labeled rendition and caption-track selectors inside the fullscreen control bar; the native fallback exposes automatic quality only. The pinned Media Chrome caption toggle emits `aria-checked` on a button, rejected by the actual captioned-demo accessibility check, so that redundant toggle is not mounted. The native select provides both Off and actual track choices without a second control implementation. Missing film captions must be stated, not fabricated. Disable library-owned preference persistence in favor of Aster's validated versioned Redux preferences after hydration.

Local QoE collects every event only within the current mounted player, with a 64-event cap and no remote transport, durable storage, IDs or URLs. Measure session result/duration, manifest load, first frame, rendition change, rebuffer duration, fatal error and completion. Export only the bounded sanitized measurements on deliberate user action. This is not a field SLO or an ingestion service.

## Alternatives and acceptance

| Strategy | Benefit | Cost / decision |
| --- | --- | --- |
| Native video controls only | Smallest additional control code; browser-maintained accessibility | Inconsistent custom quality/caption interaction and diagnostics; retained as playback capability fallback, not the primary control strategy |
| Custom React controls | Complete styling/state ownership | Aster must implement keyboard, focus, ranges, menus and screen-reader semantics; unnecessary maintenance for this phase |
| Media Chrome React wrappers | Existing semantic controls and CSS customization around a normal video element | Adds web components and a React bridge; selected subject to actual build/browser acceptance |
| Full alternative player framework | More adapters and features | Duplicates HLS/session/lifecycle ownership beyond current requirements; not selected |

Compatibility acceptance requires the pinned React 19.2.8/Next 16.3.3 build, no SSR/browser-global access before activation, captions/quality behavior, keyboard and accessible names, Chromium playback and recorded native/WebKit/Firefox limitations. Measure lazy bundle impact from the actual build, not package download size. No untested browser/device support is claimed. An unavailable required control or license incompatibility reopens this decision; do not build a parallel framework to hide failure.

## References

Official [React integration](https://www.media-chrome.org/docs/en/react/get-started), [controller contract](https://www.media-chrome.org/docs/en/components/media-controller), [Media Chrome source/license](https://github.com/muxinc/media-chrome), and [HLS.js API](https://hlsjs.video-dev.org/api-docs/hls.js.hls). Registry packages: [Media Chrome 4.19.2](https://registry.npmjs.org/media-chrome/4.19.2) and [HLS.js 1.7.1](https://registry.npmjs.org/hls.js/1.7.1). Package contents and acceptance results remain separate evidence, not inferred from documentation.
