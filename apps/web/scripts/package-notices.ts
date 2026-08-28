import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

interface Manifest {
  name: string;
  version: string;
  license?: string;
  repository?: unknown;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const legalName = /^(?:licen[cs]e|copying|notice|copyright)(?:[.-]|$)/iu;
const supplements: Record<string, string> = {
  "@wry/trie@0.5.0": "WRY-MIT.txt",
  "@wry/context@0.7.4": "WRY-MIT.txt",
  "react-remove-scroll-bar@2.3.8": "SCROLL-BAR-MIT.txt",
  "client-only@0.0.1": "REACT-MIT.txt",
  "server-only@0.0.1": "REACT-MIT.txt",
};

export async function packageWebNotices(webRoot: string, standaloneRoot: string) {
  const workspace = await realpath(resolve(webRoot, "../.."));
  const standalone = await realpath(standaloneRoot);
  assert.ok(standalone.startsWith((await realpath(webRoot)) + sep), "Output escapes Web build");
  const output = join(standaloneRoot, "THIRD_PARTY_LICENSES");
  const packages = new Map<string, { manifest: Manifest; file: string }>();
  let entries = 0;
  let bytes = 0;
  const artifacts: { path: string; sha256: string; bytes: number }[] = [];

  async function boundedFile(file: string): Promise<Buffer> {
    const info = await stat(file);
    assert.ok(
      info.isFile() && info.size > 0 && info.size <= 2 * 1024 * 1024,
      "Invalid notice size",
    );
    const data = await readFile(file);
    bytes += data.length;
    assert.ok(bytes <= 32 * 1024 * 1024, "Notice inventory exceeds byte budget");
    return data;
  }

  async function record(source: string, destination: string) {
    const data = await boundedFile(source);
    const target = join(output, destination);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    artifacts.push({
      path: destination.split(sep).join("/"),
      sha256: createHash("sha256").update(data).digest("hex"),
      bytes: data.length,
    });
  }

  async function resolvePackage(from: string, name: string, optional: boolean) {
    assert.match(name, /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/u);
    for (const directory of createRequire(from).resolve.paths(name) ?? []) {
      const candidate = join(directory, name, "package.json");
      try {
        await access(candidate);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          continue;
        }
        throw error;
      }
      const canonical = await realpath(candidate);
      assert.ok(canonical.startsWith(workspace + sep), "Dependency escapes workspace");
      return canonical;
    }
    assert.ok(optional, "Missing production dependency: " + name);
    return undefined;
  }

  async function visit(file: string, own = false) {
    const canonical = await realpath(file);
    const manifest = JSON.parse(await readFile(canonical, "utf8")) as Manifest;
    assert.match(manifest.name, /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/u);
    assert.match(manifest.version, /^[0-9][a-zA-Z0-9.+-]*$/u);
    const key = manifest.name + "@" + manifest.version;
    if (packages.has(key)) {
      return;
    }
    if (!own) {
      assert.ok(packages.size < 256, "Too many production packages");
      packages.set(key, { manifest, file: canonical });
    }
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    };
    for (const name of Object.keys(dependencies).sort()) {
      const dependency = await resolvePackage(
        canonical,
        name,
        Object.hasOwn(manifest.optionalDependencies ?? {}, name),
      );
      if (dependency) {
        await visit(dependency);
      }
    }
  }

  // Include browser-bundled production code as well as files selected by Node tracing.
  await visit(join(webRoot, "package.json"), true);
  const virtualStore = join(standaloneRoot, "node_modules/.pnpm");
  for (const entry of await readdir(virtualStore, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules") {
      continue;
    }
    const modules = join(virtualStore, entry.name, "node_modules");
    const names = [];
    for (const child of await readdir(modules, { withFileTypes: true })) {
      if (!child.isDirectory()) {
        continue;
      }
      if (child.name.startsWith("@")) {
        for (const scoped of await readdir(join(modules, child.name), { withFileTypes: true })) {
          if (scoped.isDirectory()) {
            names.push(child.name + "/" + scoped.name);
          }
        }
      } else {
        names.push(child.name);
      }
    }
    for (const name of names) {
      const source = join(
        workspace,
        "node_modules/.pnpm",
        entry.name,
        "node_modules",
        name,
        "package.json",
      );
      await visit(source);
    }
  }
  assert.ok(packages.size > 0, "No production packages found");

  async function legalFiles(directory: string, prefix = "", depth = 0): Promise<string[]> {
    assert.ok(depth <= 20, "Notice traversal exceeds depth budget");
    const result: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.ok(++entries <= 50_000, "Notice traversal exceeds entry budget");
      const name = join(prefix, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        result.push(...(await legalFiles(join(directory, entry.name), name, depth + 1)));
      } else if (entry.isFile() && legalName.test(entry.name)) {
        result.push(name);
      }
    }
    return result.sort();
  }

  try {
    assert.ok((await lstat(output)).isDirectory(), "Notice output must be a real directory");
    assert.equal(await realpath(output), join(standalone, "THIRD_PARTY_LICENSES"));
    await rm(output, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  await mkdir(output);
  const extras = join(webRoot, "licenses");
  for (const entry of await readdir(extras, { withFileTypes: true })) {
    assert.ok(entry.isFile(), "License supplement must be a regular file");
    await record(join(extras, entry.name), join("supplements", entry.name));
  }
  const inventory = [];
  for (const [key, { manifest, file }] of [...packages].sort(([a], [b]) =>
    a.localeCompare(b, "en"),
  )) {
    const directory = dirname(file);
    const destination = encodeURIComponent(key);
    const notices = await legalFiles(directory);
    let supplement = supplements[key];
    if (manifest.name === "@next/env" || manifest.name.startsWith("@next/swc-")) {
      assert.equal(manifest.version, "16.3.3", "Review Next license inheritance on upgrade");
      const next = await resolvePackage(join(webRoot, "package.json"), "next", false);
      assert.ok(next);
      await record(join(dirname(next), "license.md"), join(destination, "license.md"));
      supplement = "next@16.3.3/license.md";
    }
    if (manifest.name.startsWith("@img/sharp-libvips-")) {
      assert.equal(manifest.version, "1.3.3", "Review native bundle on upgrade");
      await record(join(directory, "README.md"), join(destination, "README.md"));
      await record(join(directory, "versions.json"), join(destination, "versions.json"));
      for (const required of ["LGPL-3.0.txt", "GPL-3.0.txt"]) {
        await access(join(extras, required));
      }
      supplement = "LGPL-3.0.txt + GPL-3.0.txt; native notices in README.md";
    }
    if (supplements[key]) {
      await access(join(extras, supplements[key]));
    }
    assert.ok(notices.length > 0 || supplement, "Missing upstream notice: " + key);
    for (const notice of notices) {
      await record(join(directory, notice), join(destination, notice));
    }
    inventory.push({
      name: manifest.name,
      version: manifest.version,
      license: manifest.license,
      repository: manifest.repository,
      notices: notices.map((name) => name.split(sep).join("/")),
      ...(supplement ? { supplement } : {}),
    });
  }
  await copyFile(join(webRoot, "THIRD_PARTY_NOTICES.md"), join(output, "README.md"));
  const result = {
    scope:
      "Installed Web production dependency closure plus traced standalone packages; notices are not a release SBOM.",
    packages: inventory,
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path, "en")),
  };
  await writeFile(join(output, "inventory.json"), JSON.stringify(result, null, 2) + "\n");
  return {
    packages: packages.size,
    artifacts: artifacts.length,
    bytes,
    output: relative(workspace, output),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = await packageWebNotices(root, join(root, ".next/standalone"));
  console.log(JSON.stringify({ check: "web-third-party-notices", ...result }));
}
