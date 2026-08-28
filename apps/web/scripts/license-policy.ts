// ADR-0019/0020: the GitHub action ignores versions; lock/installed checks use these pins.
export const reviewedLicensePackages = [
  {
    name: "@axe-core/playwright",
    version: "4.13.0",
    license: "MPL-2.0",
  },
  {
    name: "axe-core",
    version: "4.13.0",
    license: "MPL-2.0",
  },
  {
    name: "@img/sharp-libvips-darwin-arm64",
    version: "1.3.3",
    license: "LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-libvips-darwin-x64",
    version: "1.3.3",
    license: "LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-libvips-linux-arm",
    version: "1.3.3",
    license: "LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-libvips-linux-arm64",
    version: "1.3.3",
    license: "LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-libvips-linux-ppc64",
    version: "1.3.3",
    license: "LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-libvips-linux-riscv64",
    version: "1.3.3",
    license: "LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-libvips-linux-s390x",
    version: "1.3.3",
    license: "LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-libvips-linux-x64",
    version: "1.3.3",
    license: "LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-libvips-linuxmusl-arm64",
    version: "1.3.3",
    license: "LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-libvips-linuxmusl-x64",
    version: "1.3.3",
    license: "LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-win32-arm64",
    version: "0.35.4",
    license: "Apache-2.0 AND LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-win32-ia32",
    version: "0.35.4",
    license: "Apache-2.0 AND LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-win32-x64",
    version: "0.35.4",
    license: "Apache-2.0 AND LGPL-3.0-or-later",
  },
  {
    name: "@img/sharp-wasm32",
    version: "0.35.4",
    license: "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  },
  {
    name: "caniuse-lite",
    version: "1.0.30001810",
    license: "CC-BY-4.0",
  },
  {
    name: "lightningcss",
    version: "1.32.0",
    license: "MPL-2.0",
  },
  {
    name: "lightningcss-android-arm64",
    version: "1.32.0",
    license: "MPL-2.0",
  },
  {
    name: "lightningcss-darwin-arm64",
    version: "1.32.0",
    license: "MPL-2.0",
  },
  {
    name: "lightningcss-darwin-x64",
    version: "1.32.0",
    license: "MPL-2.0",
  },
  {
    name: "lightningcss-freebsd-x64",
    version: "1.32.0",
    license: "MPL-2.0",
  },
  {
    name: "lightningcss-linux-arm-gnueabihf",
    version: "1.32.0",
    license: "MPL-2.0",
  },
  {
    name: "lightningcss-linux-arm64-gnu",
    version: "1.32.0",
    license: "MPL-2.0",
  },
  {
    name: "lightningcss-linux-arm64-musl",
    version: "1.32.0",
    license: "MPL-2.0",
  },
  {
    name: "lightningcss-linux-x64-gnu",
    version: "1.32.0",
    license: "MPL-2.0",
  },
  {
    name: "lightningcss-linux-x64-musl",
    version: "1.32.0",
    license: "MPL-2.0",
  },
  {
    name: "lightningcss-win32-arm64-msvc",
    version: "1.32.0",
    license: "MPL-2.0",
  },
  {
    name: "lightningcss-win32-x64-msvc",
    version: "1.32.0",
    license: "MPL-2.0",
  },
] as const;

export const reviewedLicensePurls = reviewedLicensePackages.map(
  ({ name }) => "pkg:npm/" + name.replace("@", "%40"),
);

export function verifyReviewedLockVersions(lock: string): void {
  const actual = new Map<string, Set<string>>();
  for (const entry of lock.matchAll(/^ {2}'?([^\s']+)@([^:'\s(]+)[^:]*:/gmu)) {
    const name = entry[1];
    const version = entry[2];
    if (!name || !version) {
      continue;
    }
    const versions = actual.get(name) ?? new Set<string>();
    versions.add(version);
    actual.set(name, versions);
  }
  for (const { name, version } of reviewedLicensePackages) {
    const found = actual.get(name);
    if (!found || found.size !== 1 || !found.has(version)) {
      throw new Error("Unreviewed or missing dependency version: " + name);
    }
  }
}
