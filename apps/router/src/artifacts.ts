import { lstat, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TextDecoder } from "node:util";
import type { ArtifactSet } from "./composition.js";

const ARTIFACT_NAMES = new Set([
  "api.graphql",
  "supergraph.graphql",
  "catalog.graphql",
  "identity.graphql",
  "playback.graphql",
  "engagement.graphql",
  "manifest.json",
]);

export async function readBoundedFile(path: string, maxBytes = 1_048_576): Promise<string> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > maxBytes) {
    throw new Error("Expected a bounded regular source/artifact file: " + path);
  }
  const bytes = await readFile(path);
  if (bytes.byteLength > maxBytes) {
    throw new Error("File grew beyond its bound: " + path);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function verifyArtifacts(directory: string, artifacts: ArtifactSet): Promise<void> {
  for (const [name, source] of Object.entries(artifacts)) {
    if (!ARTIFACT_NAMES.has(name) || (await readBoundedFile(join(directory, name))) !== source) {
      throw new Error("Stale supergraph artifact: " + name + ". Run pnpm schema:update.");
    }
  }
}

export async function writeArtifacts(directory: string, artifacts: ArtifactSet): Promise<void> {
  if (
    Object.keys(artifacts).length !== ARTIFACT_NAMES.size ||
    Object.keys(artifacts).some((name) => !ARTIFACT_NAMES.has(name))
  ) {
    throw new Error("Unexpected artifact set.");
  }
  await mkdir(directory, { recursive: true });
  // Refuse existing links instead of following them during explicit regeneration.
  const directoryMetadata = await lstat(directory);
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    throw new Error("Artifact directory must be a regular directory.");
  }
  for (const name of ARTIFACT_NAMES) {
    try {
      await readBoundedFile(join(directory, name));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }
  for (const [name, source] of Object.entries(artifacts)) {
    await writeFile(join(directory, name), source, { encoding: "utf8" });
  }
}
