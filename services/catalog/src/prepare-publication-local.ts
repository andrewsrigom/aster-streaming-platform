import {
  preparePublicationStorage,
  publicationStorageClient,
} from "./infrastructure/media/publication-storage.js";

const controller = new AbortController();
const stop = () => {
  controller.abort();
};
const deadline = setTimeout(stop, 15000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
let client: ReturnType<typeof publicationStorageClient> | undefined;
try {
  if (
    process.argv.length !== 2 ||
    process.env["ASTER_ENVIRONMENT"] !== "local" ||
    process.env["ASTER_MEDIA_PUBLICATION_ENABLED"] !== "true"
  ) {
    throw new Error("Local publication storage activation rejected.");
  }
  client = publicationStorageClient();
  await preparePublicationStorage(client, controller.signal);
  process.stdout.write(
    JSON.stringify({ event: "publication_storage_ready", bucket: "aster-media-published" }) + "\n",
  );
} catch {
  process.stderr.write(
    JSON.stringify({
      event: "publication_storage_failed",
      code: controller.signal.aborted ? "CANCELLED" : "REJECTED",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  client?.destroy();
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
