# Licensing and Attribution

Aster separates source-code licensing from media licensing.

## Source code

Aster source code and project-authored documentation are available under the [MIT License](LICENSE). The SPDX identifier is `MIT`; the canonical license text is published by the [Open Source Initiative](https://opensource.org/license/mit/).

The project notice uses `Aster contributors`. Each contributor retains copyright in their contribution and provides it under the repository's MIT terms. Contributions must be original or submitted with sufficient permission to use and relicense them under MIT.

Third-party dependencies, generated third-party notices, trademarks, and externally sourced materials are not relicensed by Aster. They remain under their respective terms. Automated notices and a software bill of materials will be produced during the release phase.

## Source dependencies

P01-R03 exact-pins the first production source dependency. It remains under its upstream terms and is not relicensed by Aster.

| Package | Selected artifact | License | Source and terms |
|---|---|---|---|
| Zod | `zod@4.4.3` | MIT | [Source](https://github.com/colinhacks/zod/tree/v4.4.3) and [package license](https://github.com/colinhacks/zod/blob/v4.4.3/LICENSE) |

The frozen lockfile records the registry integrity. The P01-R03 dependency review, installed size, generated public boundary, and vulnerability-audit result are recorded in [`evidence/phase-01/runtime-configuration.txt`](evidence/phase-01/runtime-configuration.txt).

P01-R07 adds separately licensed runtime dependency graphs for PostgreSQL, Redis, Kafka-compatible messaging, and S3-compatible storage. The S3 graph includes unmodified transitive `bowser@2.14.1` through `@aws-sdk/core@3.977.9`. Although its manifest declares MIT, GitHub classifies the complete distributed license as `MIT AND MITNFA`. Aster preserves the upstream notice and recognizes the SPDX `MITNFA` identifier without relicensing the package or exempting it from dependency review. Any later modification, fork, or notice-stripping bundle requires a new review. [ADR-0012](docs/adr/0012-mitnfa-dependency-license.md) records the condition, alternatives, validation, and rollback; this record is not legal advice.

## Local runtime dependencies

P01-R01 references unmodified Docker Official Images by exact digest. These runtime artifacts are pulled from their publishers and are not relicensed under Aster's MIT License.

| Runtime | Selected artifact | License treatment | Source and terms |
|---|---|---|---|
| PostgreSQL | `postgres:18.6-alpine3.23` | PostgreSQL License | [PostgreSQL source and license](https://www.postgresql.org/about/licence/) and [Docker Official Image](https://hub.docker.com/_/postgres) |
| Redis Open Source | `redis:8.10.0-alpine` | AGPLv3 option from the Redis 8 tri-license; image is used unmodified as a separate local service | [Redis licensing](https://redis.io/legal/licenses/), [Redis source](https://github.com/redis/redis/tree/8.10.0), and [Docker Official Image](https://hub.docker.com/_/redis) |
| Grafana OSS | `grafana/grafana:13.2.0` | AGPL-3.0-only; the official image is used unmodified as a separate local service and Aster adds only MIT configuration | [Grafana licensing](https://grafana.com/licensing/), [source and release](https://github.com/grafana/grafana/releases/tag/v13.2.0), and [Docker installation](https://grafana.com/docs/grafana/latest/setup-grafana/installation/docker/) |

The Compose files and repository-owned child images record immutable multi-platform digests. Operators and distributors remain responsible for complying with the selected third-party terms. Any future modification, redistribution, or hosted offering involving these runtimes requires a new license review; this record is not legal advice.

## Media assets

Every media title has an independent rights record. A title may not be published merely because it appears on a site associated with open content.

The repository's MIT License does not apply to media originals, renditions, artwork, captions, music, fonts, logos, trademarks, or other third-party assets unless a specific rights record explicitly says so.

The rights record must include:

- title;
- creator and copyright holder;
- canonical source page;
- exact asset source;
- exact license and version;
- license URL;
- required attribution text;
- modification status;
- commercial-use status;
- share-alike or downstream conditions, if any;
- third-party music, font, logo, character, or trademark notes;
- review date and reviewer;
- source checksum;
- transformation history.

## Creative Commons material

When a Creative Commons license applies:

- preserve attribution and license notices;
- identify material changes such as transcoding, cropping, subtitle correction, or artwork generation;
- link to the applicable license;
- avoid implying endorsement;
- do not apply legal or technical restrictions that conflict with the license;
- keep the original rights record alongside generated renditions.

Aster will not apply DRM to Creative Commons assets unless a documented rights review proves that the exact license and distribution arrangement permit it.

## Candidate source collection

Blender Studio Open Movies are candidate catalog sources because official project pages provide film information and distribution assets. Each individual film still requires verification against its official page before download and publication.

See `docs/product/CONTENT_RIGHTS.md` for the workflow and `docs/references/OFFICIAL_REFERENCES.md` for source links.
