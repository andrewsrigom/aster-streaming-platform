# Screen-reader and final Web acceptance

Scope: P05-R05/R06/R10/R11. Agent-mediated review using an actual, unmodified screen reader, not an accessibility-tree substitute or a human usability study. [Speech transcript, source hashes and environment](reader-speech.json), [60-second audio excerpt](reader-speech.wav.gz), [browser regression records](browser-live-regions.json) and [final performance samples](performance-live-regions.json) preserve the results.

## Environment and method

The disposable `aster-p05-reader-lab` used Debian Trixie, Orca 48.1-1+deb13u2, Firefox ESR 140.14.0esr-1~deb13u1, AT-SPI 2.56.2, Speech Dispatcher 0.12.0 and eSpeak NG. Its pinned Node/Debian base was `sha256:ab3eebe934147fee049b5eb83c570f68c849a13c930bdfa482de99fcdfa3b3de`; exact final lab and Web images are in the JSON. Lab installation left upstream packages and copyright files unchanged. This tooling is not included in Aster images or CI dependencies; see [ADR-0019](../../docs/adr/0019-accessibility-test-tooling.md).

The lab had a private Xvfb display, D-Bus session, PulseAudio null sink and fresh Firefox profile. Runtime limits were two CPUs, 1536 MiB, 512 PIDs, read-only root, UID 1000, dropped capabilities, no-new-privileges and bounded tmpfs. No host display, user profile, credential, Docker socket or retained-data mount was supplied. Docker Desktop host networking reached the local public demo only. Browser sandboxing remained enabled. The initial 256-PID limit caused Firefox resource exhaustion and was increased only for this lab after inspecting its cgroup limit events.

Startup used `dbus-run-session -- bash /opt/aster-reader/start.sh`, bounded by `timeout 1200`. The script launched `Xvfb :99 -screen 0 1280x900x24 -nolisten tcp`, PulseAudio, `speech-dispatcher --run-single --log-level 5 --log-dir /tmp/speech-logs`, `orca --debug-file /tmp/orca-debug.log` and `firefox-esr --no-remote --profile /tmp/firefox http://127.0.0.1:3000`. The private AT-SPI `ScreenReaderEnabled` property was enabled through D-Bus. Native `xdotool key` actions used observed focus; heading navigation used `h`, modal/form navigation used Tab/Return/Escape. Only fictional names were entered.

`parecord --device=aster_reader.monitor --rate=16000 --channels=1 --file-format=wav /tmp/reader-explicit.wav` captured actual synthesis. The committed gzip contains unchanged PCM seconds 90–150 of that recording: form controls, saving, profile creation and selection. The JSON retains the full recording hash, excerpt hash, sample format and all 247 speech-output records. No independent speech-to-text engine generated the transcript; it comes from Orca's speech requests. Audio capture confirms that those requests reached synthesis, not that every utterance was perceived by a person.

## Findings and correction

Earlier Orca 43/Chromium and Orca 50/Chromium/Firefox trials did not provide reliable modal/live-status acceptance. They were not counted as passing baselines. The stable Orca/Firefox pair exposed two concrete issues: initially populated status elements did not produce useful prior-region updates, and Orca's status-bar event filter discarded rapid updates. A browser regression first failed because no empty announcement regions existed; persistent regions fixed that failure but did not by themselves establish spoken acceptance.

The final profile flow uses two persistent `div` regions with explicit `aria-live="polite"` and `aria-atomic="true"`. This follows the [documented explicit live-region pattern](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live). It preserves non-interrupting status semantics without artificial delays, assertive alerts, reader patches or changes to authentication/transport deadlines. The test verifies that the same nodes exist before and during updates. The [W3C ARIA22 checks](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22) explain why a region must precede its message; the explicit property pattern is used here instead of the optional status role.

On 2026-08-28 UTC, actual speech included:

| Time | Observed behavior |
|---|---|
| 00:00:38 / 00:01:00 | Sign-out and local-session-start results announced |
| 00:01:31–00:01:54 | Required fictional-name field, language/maturity controls and Save button identified |
| 00:02:01 | Saving and successful profile creation announced |
| 00:02:09–00:02:23 | Profile identified as unpressed, selection announced, then active/pressed state identified |
| 00:02:51–00:02:53 | Sign-out announced; Escape restored the Profiles launcher |
| 00:03:28–00:04:03 | Browse heading, localized title link and destination title heading read through native navigation |

The first final functional run passed 18/19 scenarios. Its sole failure was the test's overly narrow handling of an axe contrast incomplete for the dialog description when a retained fictional profile was present; there were no axe violations. The screenshot showed readable content. Supplementary checks now measure the opaque modal background contrast and sample each text line for actual occlusion; unexpected targets or obscured text still fail. The populated-profile confirmation passed in 8.1 seconds. No rule or subtree was excluded.

## Performance, cleanup and limits

The final complete functional confirmation passed 19/19 scenarios in 72.232 seconds, with no retries/skips and fourteen axe scans without violations. [Raw confirmation and supplementary checks](browser-live-regions.json) retain the earlier failure as well. Web tests passed 22/22; types and the complete [source candidate gate](source-live-regions.txt) passed 58/58 tasks in 60.518 seconds (28 cached). The preceding gate attempt caught missing repository-memory resume labels, corrected without changing its policy. A fresh agent-browser smoke showed the seeded browse page, no recorded errors or framework overlay and the expected controls.

After removing the lab and closing its verification browser, the unchanged three-visit mobile workload passed in 15.380 seconds: LCP 1596–1608 ms, INP 64–80 ms, CLS 0, provider hydration 2524–2553.2 ms, initial JavaScript 240892 bytes, cumulative JavaScript 259211 bytes and images 10204 bytes. Initial GraphQL/prefetch count remained zero. Preflight load was 0.95 with 88%/95% idle; postflight was 0.75 with 89%/98% idle. All original budgets remain unchanged; previous failures are retained. This is laboratory evidence, not a field SLO.

The exact `Reader final fixture` version 1 was removed through Identity, the prior zero-profile baseline was confirmed and the verification session was signed out. The labeled lab container had no mounts and was removed after exporting evidence. Retained databases and existing Docker projects were not reset. Raw lab archives remain locally under `/tmp/aster-p05-reader-cXKOkC`; no Windows control-policy stop was bypassed.

This validates the selected desktop reader/browser and implemented Phase 05 flows. It does not certify all assistive technologies, mobile readers, future player controls or product-level Phase 14 accessibility. Hosted review/release gates remain separate. Clean startup, seed, owner authorization and network-isolation evidence remains applicable because this correction changes only client presentation and test assertions; formatting-only source changes do not alter the measured behavior.
