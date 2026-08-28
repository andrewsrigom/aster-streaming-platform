# Web third-party notices

`components/ui/button.tsx` adapts the shadcn/ui Button source. Unused variants and polymorphic Slot behavior are omitted. Source: <https://ui.shadcn.com/r/styles/new-york-v4/button.json>. Upstream license: <https://github.com/shadcn-ui/ui/blob/main/LICENSE.md>, reviewed 2026-08-27.

## Dependency notices

Aster-authored code remains MIT; each dependency retains its own terms. The Web build creates `THIRD_PARTY_LICENSES/inventory.json` inside the standalone output, with original notices and SHA-256 hashes. Docker includes this directory at `/app/THIRD_PARTY_LICENSES`. It covers the installed production dependency closure, traced runtime packages and nested vendor notices, including code bundled into browser assets. Some closure entries are build-only; the inventory does not claim they execute in the final runtime. No dependency license grants rights to film content.

- **sharp 0.35.4 / libvips bundle 1.3.3:** server-side image optimization. Sharp is Apache-2.0; the separately loaded native bundle uses LGPL-3.0-or-later and its component licenses. Its preserved README contains the upstream license table; versions.json records exact components. GPL/LGPL texts accompany the image under `THIRD_PARTY_LICENSES/supplements`. [Bundle source, build inputs and patches](https://github.com/lovell/sharp-libvips/tree/v1.3.3), [libvips 8.18.6 source](https://github.com/libvips/libvips/tree/v8.18.6), [sharp source](https://github.com/lovell/sharp/tree/v0.35.4). Aster does not modify these libraries or restrict their modification/replacement or reverse engineering for debugging. [Custom libvips and build instructions](https://sharp.pixelplumbing.com/install/) describe upstream alternatives. Binary-image publication additionally requires verified corresponding-source availability and installation/relinking instructions; no perpetual source offer is asserted here.
- **Lightning CSS 1.32.0:** unmodified build tooling under [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/), with [corresponding source](https://github.com/parcel-bundler/lightningcss/tree/v1.32.0). It is not present in the inspected standalone runtime.
- **caniuse-lite 1.0.30001810:** browser-compatibility data from [Can I Use](https://caniuse.com/), Alexis Deveria and contributors, under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). [Dataset source](https://github.com/browserslist/caniuse-lite). Aster consumes the unmodified dataset during the build; it does not publish a modified dataset or imply endorsement. The dataset is absent from the inspected standalone runtime.
- **@axe-core/playwright and axe-core 4.13.0:** unmodified dev-only accessibility tools under MPL-2.0; [adapter source](https://github.com/dequelabs/axe-core-npm/tree/70dca949a4e55e2fb83e4e6896fbbf788c56b6fd), [engine source](https://github.com/dequelabs/axe-core/tree/v4.13.0). They are not production dependencies.
- **HLS.js 1.7.1 / Media Chrome 4.19.2 / ce-la-react 0.3.2:** unmodified client-only media adapter and controls, under Apache-2.0, MIT (Mux) and BSD-3-Clause (Google), respectively. Their original license files are included by the same production-closure inventory. [Player-control decision](../../docs/adr/0028-player-controls.md). These software licenses grant no rights to media or captions.

Supplemental upstream license texts cover package-root omissions. Their provenance accompanies them in `THIRD_PARTY_LICENSES/supplements/SOURCES.md`. Package updates require reviewing the actual use and terms again; this notice is not a license override or complete release SBOM.

## shadcn/ui

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
