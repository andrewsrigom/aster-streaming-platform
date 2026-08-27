import { createHash } from "node:crypto";
import { lstat, opendir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 512;
const patterns: readonly [string, RegExp][] = [
  ["server-configuration", /\bASTER_[A-Z][A-Z0-9_]*\b/u],
  ["private-transport", /x-aster-router-credential|\/run\/aster-trust\//iu],
  [
    "private-endpoint",
    /https?:\/\/(?:router|identity|catalog|postgres|redis)(?::\d+)?(?:[/"'\s?]|$)/iu,
  ],
  ["database-endpoint", /\b(?:postgres(?:ql)?|redis|mongodb(?:\+srv)?):\/\//iu],
  ["session-cookie", /\baster_local_session\b/u],
  ["private-key", /-----BEGIN (?:DSA |EC |OPENSSH |RSA )?PRIVATE KEY-----/u],
  ["access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z\d_]{30,255}|github_pat_[A-Za-z\d_]{20,255})\b/u],
  ["jwt", /\beyJ[A-Za-z\d_-]{12,}\.[A-Za-z\d_-]{16,}\.[A-Za-z\d_-]{16,}\b/u],
  ["test-instrumentation", /\b(?:axe-core|web-vitals)\b/u],
];

// These checks cover named Aster boundaries, not arbitrary secret obfuscation.
// Normalize common JS/Flight escapes; never report matched text or credentials.
export function publicArtifactFindings(source: string, privateValues: readonly string[] = []) {
  if (Buffer.byteLength(source) > MAX_FILE_BYTES) {
    throw new Error("Public artifact exceeds the scan bound.");
  }
  if (
    privateValues.length > 32 ||
    privateValues.some((value) => value.length < 8 || value.length > 4096)
  ) {
    throw new Error("Private fixture values exceed the scan contract.");
  }
  let decoded = source;
  for (let pass = 0; pass < 3; pass++) {
    decoded = decoded.replace(
      /\\(?:u([a-f\d]{4})|x([a-f\d]{2})|([\\/]))/giu,
      (
        _match,
        unicode: string | undefined,
        hex: string | undefined,
        escaped: string | undefined,
      ) =>
        unicode || hex
          ? String.fromCharCode(Number.parseInt(unicode ?? hex ?? "", 16))
          : (escaped ?? ""),
    );
  }
  const findings = patterns.filter(([, pattern]) => pattern.test(decoded)).map(([rule]) => rule);
  if (privateValues.some((value) => decoded.includes(value))) {
    findings.push("private-fixture-value");
  }
  return findings;
}

export async function verifyPublicBuild(directory: string) {
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) {
    throw new Error("Expected a real public build directory.");
  }
  const pending = [{ path: "", depth: 0 }];
  const assets: { path: string; bytes: number; sha256: string }[] = [];
  let entries = 0;
  let totalBytes = 0;
  let javascriptFiles = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      break;
    }
    const handle = await opendir(join(directory, current.path));
    for await (const entry of handle) {
      entries++;
      if (entries > MAX_ENTRIES || current.depth > 8) {
        throw new Error("Public build exceeds its entry/depth bound.");
      }
      const path = join(current.path, entry.name);
      if (entry.isDirectory()) {
        pending.push({ path, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) {
        throw new Error("Public build contains a link or special file.");
      }
      if (extname(path) === ".map") {
        throw new Error("Public source maps are not part of the reviewed build.");
      }
      const absolute = join(directory, path);
      const metadata = await lstat(absolute);
      totalBytes += metadata.size;
      if (metadata.size > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
        throw new Error("Public build exceeds its byte bound.");
      }
      if (![".js", ".css", ".json"].includes(extname(path))) {
        continue;
      }
      const bytes = await readFile(absolute);
      if (extname(path) === ".js" && bytes.length === 0) {
        throw new Error("Public build contains empty JavaScript.");
      }
      const findings = publicArtifactFindings(decoder.decode(bytes));
      if (findings.length > 0) {
        throw new Error(`Public build boundary failed: ${findings.join(", ")}. Values redacted.`);
      }
      javascriptFiles += extname(path) === ".js" ? 1 : 0;
      assets.push({
        path,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  if (javascriptFiles === 0) {
    throw new Error("Public build has no JavaScript to verify.");
  }
  return {
    entries,
    totalBytes,
    javascriptFiles,
    assets: assets.sort((a, b) => a.path.localeCompare(b.path)),
  };
}
