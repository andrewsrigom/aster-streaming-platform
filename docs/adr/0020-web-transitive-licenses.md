# ADR-0020: Web Dependency Licenses and Packaged Notices

- Status: Accepted
- Date: 2026-08-28
- Owners: Web presentation and repository tooling
- Related requirements: P05-R07, P05-R09, P05-R11

## Decision

Keep Aster-authored materials under MIT. Review the actual use of unmodified transitive dependencies instead of treating absence from the permissive-license allowlist as proof of incompatibility. Keep vulnerability checks and the general license allowlist unchanged.

Add package-scoped exceptions for sharp's reviewed LGPL native packages, Lightning CSS's MPL-2.0 packages and the CC-BY-4.0 caniuse-lite dataset, alongside ADR-0019's two accessibility tools. The dependency-review action ignores versions: a shared inventory and tests must enforce the exact lockfile versions and installed license metadata. New versions or package names require another review; this does not authorize all LGPL, MPL or Creative Commons software.

Sharp 0.35.4 loads the separate libvips 1.3.3 shared-library package for server-side responsive images. The bundle contains libvips 8.18.6 and other independently licensed libraries. Preserve its complete upstream notice table and version inventory, Apache sharp notices and the GPL-3.0/LGPL-3.0 texts. Aster does not modify the native libraries or restrict replacement, modification or reverse engineering for debugging such changes. The checked-in source and Docker recipe remain editable; rebuilding with an interface-compatible library is not prohibited.

Lightning CSS 1.32.0 is a separate build tool under MPL-2.0, not Aster-authored code. Preserve its license/source location; any modifications to its covered files retain MPL obligations. caniuse-lite 1.0.30001810 supplies browser-compatibility data under CC-BY-4.0. Credit Can I Use (caniuse.com), Alexis Deveria and contributors, link the dataset and license, and identify that Aster does not modify or republish the raw dataset. Neither is present in the inspected standalone runtime.

Next standalone output omits many package-root license files. Generate an offline notice directory from the installed production dependency closure and actual standalone package roots, also retaining nested vendor notices. Include this directory in the Docker image independently of browser assets. Keep the existing shadcn notice. This is a notice-preservation inventory, not a complete release SBOM or proof of arbitrary downstream distribution compliance.

## Distribution boundary

This phase publishes Aster source and a local Docker build recipe, not prebuilt Aster images. npm and base-image providers supply the third-party binaries directly to the builder. Before Aster distributes binary images, Phase 14 must verify complete corresponding source access, including the native bundle's upstream patches/build inputs, retained notices and replacement/relinking instructions. A source link alone is not a perpetual source-availability guarantee or an invented written offer. No proprietary media rights are inferred from these software/data licenses.

## Verification and rollback

Test changed-version and package-exception rejection, installed metadata, missing notices, bounded traversal and reproducible notice hashes. Inspect the real image, not just Dockerfile strings. Packaging-only notice changes do not invalidate unchanged application/browser measurements. Remove the exceptions and packaging together to roll back; no database or product-state changes.

## Authoritative sources

- [sharp installation and custom libvips](https://sharp.pixelplumbing.com/install/).
- [libvips bundle notices at v1.3.3](https://github.com/lovell/sharp-libvips/blob/v1.3.3/THIRD-PARTY-NOTICES.md), [build scripts and patches](https://github.com/lovell/sharp-libvips/blob/v1.3.3/build/posix.sh).
- [LGPL-3.0](https://www.gnu.org/licenses/lgpl-3.0.html), especially section 4; incorporated GPL-3.0 section 6 governs corresponding source when binaries are conveyed.
- [Lightning CSS 1.32.0 source/license](https://github.com/parcel-bundler/lightningcss/tree/v1.32.0), [MPL terms and FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).
- [caniuse-lite source and attribution](https://github.com/browserslist/caniuse-lite), [CC-BY-4.0 terms](https://creativecommons.org/licenses/by/4.0/legalcode.en).

Reviewed 2026-08-28 against installed manifests, lockfile, actual standalone files and the pinned upstream records. No new owner decision is required under the standing authorization.
