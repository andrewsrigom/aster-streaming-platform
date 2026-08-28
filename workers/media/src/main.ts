import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { MediaError, sourceIdentity } from "./domain/policy.js";
import { extractOriginal } from "./infrastructure/extract.js";
import { encodeHls, probeSource } from "./infrastructure/encode.js";
import { runProcess } from "./infrastructure/process.js";
import { encodeArtwork } from "./infrastructure/artwork.js";

const controller = new AbortController();
const abort = () => {
  controller.abort();
};
const deadline = setTimeout(abort, 1800000);
process.once("SIGTERM", abort);
process.once("SIGINT", abort);
const started = performance.now();
let peakMemory = process.memoryUsage();
const samples = setInterval(() => {
  const current = process.memoryUsage();
  peakMemory = {
    rss: Math.max(peakMemory.rss, current.rss),
    heapTotal: Math.max(peakMemory.heapTotal, current.heapTotal),
    heapUsed: Math.max(peakMemory.heapUsed, current.heapUsed),
    external: Math.max(peakMemory.external, current.external),
    arrayBuffers: Math.max(peakMemory.arrayBuffers, current.arrayBuffers),
  };
}, 1000);
try {
  const artwork = process.argv.length === 3 && process.argv[2] === "--artwork";
  if ((!artwork && process.argv.length !== 2) || process.env["ASTER_MEDIA_DECODER"] !== "local") {
    throw new MediaError("INVALID_SOURCE");
  }
  const stat = await lstat("/input/job/identity.json");
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) {
    throw new MediaError("INVALID_SOURCE");
  }
  const identity = sourceIdentity(JSON.parse(await readFile("/input/job/identity.json", "utf8")));
  await mkdir("/work/job", { mode: 0o700 });
  const extracted = await extractOriginal(
    "/input/job/original",
    "/work/job/source.mp4",
    identity,
    controller.signal,
  );
  process.stdout.write(
    JSON.stringify({ event: "media_original_extracted", identity, extracted }) + "\n",
  );
  const probe = await probeSource(
    "/work/job/source.mp4",
    "/work/job",
    controller.signal,
    (technical) => {
      process.stdout.write(JSON.stringify({ event: "media_source_probe", technical }) + "\n");
    },
  );
  process.stdout.write(
    JSON.stringify({ event: "media_source_verified", identity, extracted, probe }) + "\n",
  );
  const encoded = artwork
    ? await encodeArtwork("/work/job/source.mp4", "/output/candidate", probe, controller.signal)
    : await encodeHls(
        "/work/job/source.mp4",
        "/output/candidate",
        probe,
        controller.signal,
        (height) =>
          process.stdout.write(
            JSON.stringify({ event: "media_rendition_verified", height }) + "\n",
          ),
      );
  const ffmpeg = (await runProcess("ffmpeg", ["-version"], "/work", controller.signal, 5000)).split(
    "\n",
  )[0];
  const report = {
    event: "media_candidate_validated",
    identity,
    extracted,
    probe,
    ...encoded,
    ffmpeg,
    processingKey: createHash("sha256")
      .update(identity.sha256 + "\0" + encoded.recipe)
      .digest("hex"),
    elapsedMs: performance.now() - started,
    peakNodeMemory: peakMemory,
    outputRatio: encoded.totalBytes / identity.bytes,
    publicationAuthority: false,
  };
  await writeFile("/output/candidate/report.tmp", JSON.stringify(report) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  await rename("/output/candidate/report.tmp", "/output/candidate/report.json");
  process.stdout.write(JSON.stringify(report) + "\n");
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      event: "media_candidate_failed",
      code: controller.signal.aborted
        ? "CANCELLED"
        : error instanceof MediaError
          ? error.code
          : "INVALID_SOURCE",
      elapsedMs: performance.now() - started,
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  clearInterval(samples);
  process.off("SIGTERM", abort);
  process.off("SIGINT", abort);
}
