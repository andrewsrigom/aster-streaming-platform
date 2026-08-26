# Security and Accessibility Verification

## Security verification

### Identity

- invalid signature;
- expired token;
- wrong issuer and audience;
- missing required claim;
- session fixation and rotation behavior;
- forged internal identity header;
- cross-account profile access;
- role escalation;
- revoked access.

### GraphQL

- unknown trusted operation;
- oversized body;
- parser token exhaustion;
- depth and alias amplification;
- oversized pagination;
- high-cost nested operation;
- batching abuse;
- rapid mutation;
- identifier substitution;
- error detail leakage;
- introspection policy;
- CSRF and CORS.

### Data

- SQL injection attempts;
- migration privileges;
- cross-context credential access;
- backup access;
- deletion propagation;
- sensitive log and trace fields.

### Redis

- key injection and normalization;
- authorization-scope cache confusion;
- Lua argument bounds;
- rate-limit partition spoofing;
- outage behavior;
- no secrets or personal data in keys.

### Media

- misleading extension;
- invalid MIME;
- malformed container;
- excessive duration, dimensions, or streams;
- shell characters in metadata and URLs;
- path traversal;
- subtitle markup;
- FFmpeg timeout;
- disk exhaustion;
- object prefix escape;
- original public exposure;
- incomplete publication.

### Supply chain

- secret scan;
- dependency review;
- source analysis;
- container scan;
- license inventory;
- software bill of materials;
- artifact provenance.

## Accessibility verification

### Automated

Run automated checks on:

- home;
- browse;
- title;
- profile selection;
- search;
- watchlist;
- player;
- dialogs;
- error states.

### Keyboard

Verify:

- logical tab order;
- visible focus;
- skip navigation;
- rail navigation;
- dialogs;
- profile selection;
- all player controls;
- no traps;
- fullscreen exit;
- retry actions.

### Screen reader

Verify:

- page title and heading structure;
- landmarks;
- card names;
- dynamic status announcements;
- dialog labels and focus;
- player state and control names;
- caption availability;
- error explanation;
- attribution content.

### Visual

- contrast;
- text resizing;
- zoom;
- reflow;
- focus visibility;
- reduced motion;
- no information by color alone;
- caption readability.

### Media

- caption language and labels;
- timing and parsing;
- keyboard caption selection;
- no autoplay with sound;
- understandable playback errors;
- control timeout does not make keyboard use impossible.

## Release gate

Critical security findings and critical accessibility blockers prevent release. Exceptions require owner, user impact, mitigation, expiry, and approval; they are not silently waived.
