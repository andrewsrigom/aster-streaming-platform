# Initial Content Plan

## Goal

Launch with a small, coherent catalog of technically validated films whose rights and attribution are complete. Content count is secondary to correctness, presentation quality, and playback reliability.

## Candidate source

Blender Studio Open Movies are the primary candidate collection for the initial catalog. The official film index is the starting point for review:

https://studio.blender.org/films/

A film remains a candidate until its exact official page, downloadable asset, license version, attribution requirements, modification rights, and third-party material notes are approved in a Catalog rights record.

## Proposed waves

### Wave 0 — Technical fixture

Use a short generated or clearly licensed technical fixture for fast CI validation:

- a few seconds of video;
- one audio track;
- one caption track;
- known dimensions, frame rate, and duration;
- no personal or restricted content.

This fixture validates code mechanics. It is not a public catalog title.

### Wave 1 — One complete film

Select one candidate with:

- clear official rights evidence;
- a reliable master download;
- manageable processing size;
- available credits and artwork;
- caption source or a documented accessibility plan.

Complete the entire path:

```text
rights
→ source
→ checksum
→ processing
→ validation
→ publication
→ attribution
→ playback
→ telemetry
```

Do not begin the next full film until this path is verified.

### Wave 2 — Three-film catalog

Add two more films with different technical characteristics:

- animation versus mixed live action;
- different resolution or frame rate;
- multiple audio or subtitle conditions where available;
- different runtime.

This exposes assumptions in the processing recipe and UI.

### Wave 3 — Broader collection

Expand only after processing, storage, attribution, and operational cost are understood. Each title still receives individual review.

## Candidate register

Initial candidates for review:

| Candidate | Review state | Purpose |
|---|---|---|
| Big Buck Bunny | NOT_REVIEWED | Broadly recognized animation and multiple source variants |
| Sintel | NOT_REVIEWED | Longer animated film with dialogue and subtitle needs |
| Tears of Steel | NOT_REVIEWED | Mixed live action and visual effects |
| Elephants Dream | NOT_REVIEWED | Older source and compatibility variation |
| Cosmos Laundromat | NOT_REVIEWED | High-quality animation and modern assets |
| Caminandes | NOT_REVIEWED | Short-form title candidate |
| Spring | NOT_REVIEWED | Modern animation candidate |
| Sprite Fright | NOT_REVIEWED | Modern animation candidate |
| Charge | NOT_REVIEWED | Short-form modern candidate |

`NOT_REVIEWED` means no permission claim has been made.

## Asset categories

Review each category independently:

- master video;
- alternate audio;
- subtitle files;
- poster;
- still images;
- logos;
- fonts;
- soundtrack;
- character and project marks.

A film license does not automatically prove that every promotional asset has identical terms.

## Metadata preparation

For each approved title prepare:

- canonical title and localized titles;
- synopsis;
- runtime from validated output;
- release year;
- genres and editorial tags;
- original language;
- available audio and caption languages;
- credits;
- source and license;
- modification note;
- accessibility notes;
- artwork variants;
- publication version.

## Repository policy

Do not commit:

- source masters;
- generated HLS segments;
- full-resolution artwork;
- private object credentials;
- temporary processing output.

Commit:

- rights-record schemas;
- reviewed metadata where redistribution is appropriate;
- checksums;
- processing recipe;
- technical reports without sensitive paths;
- small test fixtures with their own license notice;
- attribution manifest.

## Download policy

- acquire only from the recorded official asset source;
- record redirects and final source;
- stream with byte and time bounds;
- checksum during acquisition;
- preserve original filename as metadata, not as trusted path;
- store under immutable controlled object key;
- never run processing from an unverified temporary download.

## Modification disclosure

Public attribution should describe material processing, such as:

- transcoded into adaptive HLS renditions;
- audio normalized or repackaged;
- subtitles converted or corrected;
- posters resized or cropped;
- thumbnails generated.

Do not imply that Aster created or is endorsed by the original project.

## Content release gate

A public title requires:

- approved rights record;
- immutable source checksum;
- passing technical validation;
- passing playback checks;
- complete metadata;
- complete attribution;
- accessible caption status;
- current publication state;
- takedown and rollback path.
