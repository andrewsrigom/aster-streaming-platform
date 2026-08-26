# Experience Principles

## Content first

Artwork, metadata, and playback controls support the film rather than competing with it. Avoid dense administrative styling in viewer-facing screens.

## Fast path to playback

A viewer should move from title discovery to first frame with minimal blocking work. Optional personalization must not sit on the critical playback path.

## Honest states

Clearly distinguish:

- unavailable;
- loading;
- empty;
- degraded;
- stale;
- failed;
- retrying.

Do not replace errors with endless skeletons.

## Continuity

Progress and profile context should behave consistently across navigation and sessions. Never move a viewer backward because an older update arrived late.

## Accessible by default

Keyboard navigation, visible focus, semantic headings, descriptive controls, captions, reduced motion, and understandable errors are baseline behavior.

## Public attribution

Rights information is part of the product, not hidden legal text. Title pages make source and license information understandable without disrupting playback.

## Progressive enhancement

Public catalog and title content should remain useful from server-rendered HTML. Rich client behavior enhances rather than replaces core information.

## Controlled motion

Use motion to clarify focus, state, and navigation. Respect reduced-motion preferences. Avoid decorative motion in the player and critical controls.

## Responsive media

Artwork and layout adapt to viewport and network constraints. The browser should not download desktop assets for small screens without a reason.

## Recovery

Errors include a meaningful next action. Playback errors distinguish session, manifest, decoding, network, and rights states when the application can identify them safely.
