import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  createAsterObjectStorageAdapter,
  type AsterObjectStorageAdapter,
} from "@aster/object-storage-s3";
import type { AsterPostgresAdapter } from "@aster/postgres";
import type { AsterTelemetry } from "@aster/telemetry";
import type { ValidatedPublicationReference } from "../../domain/title.js";
import {
  localPublicationStorage,
  preparePublicationStorage,
  publicationStorageClient,
} from "../media/publication-storage.js";
import { createPublicationAccess } from "../media/publication-access.js";
import { verifyCandidateObject } from "../media/retain-candidate.js";
import { assertPlayableSeedApproval, attestPlayableSeed } from "./playable-attestation.js";
import { readGeneratedObject, verifyGeneratedDirectory } from "./playable-files.js";
import { localMediaStorage, prepareLocalMediaStorage } from "../media/local-storage.js";

async function putImmutable(
  storage: AsterObjectStorageAdapter,
  key: string,
  bytes: Buffer,
  contentType: string,
  signal: AbortSignal,
  publiclyCacheable = false,
) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const source = Readable.from([bytes]);
  try {
    const result = await storage.write(
      {
        key,
        source,
        contentLength: bytes.length,
        checksumSha256: sha256,
        ifAbsent: true,
        contentType,
        ...(publiclyCacheable
          ? { cacheControl: "public, max-age=31536000, immutable" as const }
          : {}),
      },
      signal,
    );
    if (result.status !== "completed" && result.status !== "already_exists") {
      throw new Error("Playable seed upload unavailable.");
    }
  } finally {
    source.destroy();
  }
  await verifyCandidateObject(storage, key, { bytes: bytes.length, sha256 }, signal);
}

export function createPlayableSeedPublisher(
  report: unknown,
  directory: string,
  database: AsterPostgresAdapter,
  telemetry: AsterTelemetry,
) {
  const client = publicationStorageClient();
  const storage = createAsterObjectStorageAdapter({
    ...localPublicationStorage,
    telemetry,
    maxInFlightOperations: 1,
    maxObjectBytes: 4 * 1024 * 1024,
    connectionTimeoutMs: 1000,
    operationTimeoutMs: 5000,
  });
  const originals = createAsterObjectStorageAdapter({
    ...localMediaStorage,
    telemetry,
    maxInFlightOperations: 1,
    maxObjectBytes: 4 * 1024 * 1024,
    connectionTimeoutMs: 1000,
    operationTimeoutMs: 5000,
  });
  return {
    async ensure(publication: ValidatedPublicationReference, signal: AbortSignal) {
      const seed = await verifyGeneratedDirectory(directory, report, signal);
      await assertPlayableSeedApproval(database, report, signal);
      await prepareLocalMediaStorage(signal);
      await preparePublicationStorage(client, signal);
      const original = seed.files.find((file) => file.name === "source.mkv");
      if (!original) {
        throw new Error("Missing generated source.");
      }
      await putImmutable(
        originals,
        "originals/" + seed.checksum + "/source.mkv",
        await readGeneratedObject(directory, original, signal),
        "video/x-matroska",
        signal,
      );
      const reportBytes = Buffer.from(JSON.stringify(report));
      if (reportBytes.length > 16384) {
        throw new Error("Generated report too large.");
      }
      await putImmutable(
        originals,
        "technical-fixtures/" + createHash("sha256").update(reportBytes).digest("hex") + ".json",
        reportBytes,
        "application/json",
        signal,
      );
      const files = seed.files
        .filter((file) => file.name !== "source.mkv")
        .sort((a, b) => Number(a.name === "master.m3u8") - Number(b.name === "master.m3u8"));
      for (const file of files) {
        signal.throwIfAborted();
        await putImmutable(
          storage,
          seed.prefix + file.name,
          await readGeneratedObject(directory, file, signal),
          file.name.endsWith(".m3u8")
            ? "application/vnd.apple.mpegurl"
            : file.name.endsWith(".vtt")
              ? "text/vtt"
              : "video/mp2t",
          signal,
          true,
        );
      }
      await assertPlayableSeedApproval(database, report, signal);
      await createPublicationAccess(client).reveal(seed.prefix, signal, (active) =>
        attestPlayableSeed(database, report, publication, active),
      );
    },
    async close() {
      client.destroy();
      await Promise.all([storage.close(), originals.close()]);
    },
  };
}
