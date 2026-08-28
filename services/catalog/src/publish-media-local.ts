import { randomUUID } from "node:crypto";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import {
  createAsterObjectStorageAdapter,
  type AsterObjectStorageAdapter,
} from "@aster/object-storage-s3";
import { createAsterTelemetry } from "@aster/telemetry";
import { normalizeCatalogCommand } from "./application/command-input.js";
import { readOperatorInput } from "./transport/operator-input.js";
import { localCatalogDatabase } from "./infrastructure/identity/local-configuration.js";
import {
  createPostgresMediaAttester,
  requirePublicationApproval,
} from "./infrastructure/persistence/postgres-attestation.js";
import { localMediaStorage } from "./infrastructure/media/local-storage.js";
import {
  localPublicationStorage,
  preparePublicationStorage,
  publicationStorageClient,
} from "./infrastructure/media/publication-storage.js";
import { readCandidateReport } from "./infrastructure/media/reuse-candidate.js";
import { createPublicationBundle } from "./infrastructure/media/publication-bundle.js";
import { copyPublication } from "./infrastructure/media/copy-publication.js";
import {
  createPublicationAccess,
  grantPublicationAccess,
  PublicationAccessRecoveryError,
} from "./infrastructure/media/publication-access.js";
import { MediaProcessingError } from "./infrastructure/media/processing-error.js";

const controller = new AbortController();
const stop = (): void => {
  controller.abort();
};
const deadline = setTimeout(stop, 300000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
const telemetry = createAsterTelemetry({
  serviceName: "catalog-media-attester",
  serviceVersion: "0.0.0",
  environment: "local",
  export: { mode: "none" },
});
let database: AsterPostgresAdapter | undefined;
const storage: AsterObjectStorageAdapter[] = [];
const correlationId = randomUUID();
const started = performance.now();
try {
  const [mode, titleId, version, hlsAttemptId, artworkAttemptId] = process.argv.slice(2);
  if (
    process.argv.length !== 7 ||
    (mode !== "preview" && mode !== "attest") ||
    !titleId ||
    !hlsAttemptId ||
    !artworkAttemptId ||
    !/^[1-9][0-9]{0,9}$/u.test(version ?? "")
  ) {
    throw new Error("Invalid publication command");
  }
  database = createAsterPostgresAdapter({
    connectionString: localCatalogDatabase(process.env, "attester"),
    telemetry,
    maxConnections: 1,
    connectionTimeoutMs: 1000,
    operationTimeoutMs: 3000,
    statementTimeoutMs: 2000,
  });
  const attester = createPostgresMediaAttester(database);
  await attester.probe(controller.signal);
  const selection = { titleId, expectedVersion: Number(version), hlsAttemptId, artworkAttemptId };
  const source = await attester.read(selection, controller.signal);
  let rights = source.rights;
  let metadata = source.metadata;
  if (mode === "preview") {
    const input = await readOperatorInput(process.stdin, controller.signal);
    const proposed =
      input.command === "edit" ? normalizeCatalogCommand("edit", input.input) : undefined;
    if (
      !proposed ||
      proposed.kind !== "edit" ||
      proposed.titleId !== titleId ||
      proposed.expectedVersion !== selection.expectedVersion
    ) {
      throw new Error("Preview requires proposed editorial facts");
    }
    rights = proposed.rights;
    metadata = proposed.metadata;
  }
  const privateStorage = createAsterObjectStorageAdapter({
    ...localMediaStorage,
    telemetry,
    maxInFlightOperations: 1,
    maxObjectBytes: 16 * 1024 * 1024,
    operationTimeoutMs: 15000,
  });
  storage.push(privateStorage);
  const hls = source.hls.candidate;
  const art = source.artwork.candidate;
  if (!hls || !art) {
    throw new Error("Candidates missing");
  }
  const hlsBytes = await readCandidateReport(
    privateStorage,
    hls.prefix,
    hls.reportChecksum,
    controller.signal,
  );
  const artBytes = await readCandidateReport(
    privateStorage,
    art.prefix,
    art.reportChecksum,
    controller.signal,
  );
  const bundle = createPublicationBundle(source.identity, hlsBytes, artBytes, rights, metadata);
  if (bundle.hls.prefix !== hls.prefix || bundle.artwork.prefix !== art.prefix) {
    throw new Error("Candidate identity changed");
  }
  if (mode === "preview") {
    process.stdout.write(
      JSON.stringify({
        event: "media_publication_preview",
        bundleHash: bundle.bundleHash,
        manifestUrl: bundle.manifestUrl,
        artworkUrl: bundle.artworkUrl,
        sourceChecksum: bundle.sourceChecksum,
        posterChecksum: bundle.poster.sha256,
        publicationAuthority: false,
      }) + "\n",
    );
  } else {
    const currentApproval = async (signal = controller.signal) => {
      requirePublicationApproval(
        await attester.read(selection, signal),
        bundle,
        Math.floor(Date.now() / 1000),
      );
    };
    await currentApproval();
    const client = publicationStorageClient();
    try {
      await preparePublicationStorage(client, controller.signal);
    } finally {
      client.destroy();
    }
    const published = createAsterObjectStorageAdapter({
      ...localPublicationStorage,
      telemetry,
      maxInFlightOperations: 1,
      maxObjectBytes: 16 * 1024 * 1024,
      operationTimeoutMs: 15000,
    });
    storage.push(published);
    const copied = await copyPublication(
      bundle,
      privateStorage,
      published,
      currentApproval,
      controller.signal,
    );
    const accessClient = publicationStorageClient();
    let publicationId: string;
    try {
      publicationId = await grantPublicationAccess(
        bundle,
        published,
        createPublicationAccess(accessClient),
        currentApproval,
        controller.signal,
        (signal) =>
          attester.register(
            selection,
            bundle,
            source.rights.revision,
            {
              publicationId: randomUUID(),
              reportId: randomUUID(),
              actorId: "00000000-0000-4000-8000-000000000006",
              correlationId,
            },
            signal,
          ),
      );
    } finally {
      accessClient.destroy();
    }
    process.stdout.write(
      JSON.stringify({
        event: "media_publication_attested",
        publicationId,
        bundleHash: bundle.bundleHash,
        manifestUrl: bundle.manifestUrl,
        ...copied,
        elapsedMs: Math.round(performance.now() - started),
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        correlationId,
        editorialActivation: false,
      }) + "\n",
    );
  }
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      event: "media_publication_failed",
      accessRecoveryRequired: error instanceof PublicationAccessRecoveryError,
      code: controller.signal.aborted
        ? "CANCELLED"
        : error instanceof MediaProcessingError
          ? error.failure
          : "CONTROL_UNAVAILABLE",
      correlationId,
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  await Promise.allSettled(storage.map((client) => client.close()));
  await database?.close();
  await telemetry.shutdown();
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
