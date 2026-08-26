# Content Rights and Attribution

## Policy

Aster publishes only media for which distribution, transformation, and presentation rights have been verified for the intended use.

An “open” label, downloadable file, public URL, or source-code repository is not sufficient evidence.

## Rights record

Each title requires a durable rights record with:

```yaml
title_id:
work_title:
creator:
copyright_holder:
canonical_source_url:
asset_source_url:
license_name:
license_version:
license_url:
attribution_text:
commercial_use_allowed:
modification_allowed:
share_alike_required:
technical_restrictions:
third_party_material_notes:
trademark_notes:
source_checksum:
reviewed_at:
reviewed_by:
evidence_locations:
status:
```

`status` is one of:

- `DRAFT`
- `NEEDS_CLARIFICATION`
- `APPROVED`
- `REJECTED`
- `EXPIRED`
- `DISPUTED`

Only `APPROVED` records can support publication.

## Review procedure

1. Open the canonical project page.
2. Identify the work's actual creator and copyright holder.
3. Locate the exact license statement for the film and downloadable assets.
4. Confirm the exact license version.
5. Confirm redistribution rights.
6. Confirm modification rights for transcoding, artwork processing, and subtitle changes.
7. Confirm whether commercial use is permitted.
8. inspect credits for third-party materials with separate terms.
9. Check trademark and endorsement concerns.
10. Record required attribution and modification notice.
11. Preserve evidence and review date.
12. Approve or reject.

When terms are unclear, set `NEEDS_CLARIFICATION`. Do not infer permission.

## Blender Open Movies

Blender Studio film pages are the preferred starting point for candidate titles. Each film must be reviewed individually because project age, license version, downloadable assets, music, artwork, and attribution wording may differ.

Initial candidate list:

- Elephants Dream
- Big Buck Bunny
- Sintel
- Tears of Steel
- Cosmos Laundromat
- Caminandes
- Spring
- Sprite Fright
- Charge

Candidate status does not mean approved. Phase 03 creates rights records; Phase 06 downloads only approved assets.

## Attribution display

Attribution appears:

- on each title detail page;
- on a global acknowledgements page;
- in machine-readable catalog metadata;
- in downloadable release notices when assets are bundled;
- alongside modification notes.

A good entry contains title, creator, source link, license name and link, and a plain description of modifications.

Example structure:

```text
“Film Title” by Creator.
Source: canonical project page.
Licensed under [exact license].
Modified for Aster through HLS transcoding, audio normalization, thumbnail generation, and subtitle packaging.
No endorsement is implied.
```

The exact content comes from the approved rights record, not a hard-coded generic string.

## Technical restrictions

Do not apply DRM or another effective access restriction to Creative Commons media unless an explicit review confirms compatibility with the exact license and distribution arrangement.

Authentication or short-lived CDN delivery controls must not remove recipients' licensed freedoms. The safer initial policy is public delivery of approved open media without DRM.

## Takedown and dispute

When a rights concern is received:

1. move the rights record to `DISPUTED`;
2. retire the title immediately;
3. stop issuing new playback sessions;
4. preserve evidence and logs;
5. invalidate stable catalog and delivery references where practical;
6. investigate;
7. restore only after documented approval.

A takedown action must be auditable and reversible when the concern is resolved.
