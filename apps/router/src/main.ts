import { execFile } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readBoundedFile, verifyArtifacts, writeArtifacts } from "./artifacts.js";
import { composeLocalSupergraph, sha256 } from "./composition.js";
import { readGitBaseline } from "./baseline.js";

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const directory = resolve(root, "infra/router/generated");
const printers = {
  catalog: fileURLToPath(new URL("./print-schema.js", import.meta.resolve("@aster/catalog"))),
  discovery: fileURLToPath(new URL("./print-schema.js", import.meta.resolve("@aster/discovery"))),
  engagement: fileURLToPath(new URL("./print-schema.js", import.meta.resolve("@aster/engagement"))),
  identity: fileURLToPath(new URL("./print-schema.js", import.meta.resolve("@aster/identity"))),
  playback: fileURLToPath(new URL("./print-schema.js", import.meta.resolve("@aster/playback"))),
};

async function printOwner(path: string): Promise<string> {
  const result = await execute(process.execPath, [path], {
    cwd: root,
    env: {},
    encoding: "utf8",
    maxBuffer: 131_072,
    timeout: 5_000,
    killSignal: "SIGKILL",
    windowsHide: true,
  });
  return result.stdout;
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || (args[0] !== "--check" && args[0] !== "--write")) {
    throw new Error("Use exactly --check or --write.");
  }
  const operations = await readBoundedFile(
    resolve(root, "infra/router/known-operations.graphql"),
    131_072,
  );
  const retainedOperations = await readBoundedFile(
    resolve(root, "infra/router/retained-operations.json"),
    131_072,
  );
  let baseline: string | undefined;
  try {
    baseline = await readBoundedFile(resolve(directory, "api.graphql"));
  } catch (error) {
    if (
      args[0] !== "--write" ||
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      throw error;
    }
  }
  const [catalog, discovery, engagement, identity, playback] = await Promise.all([
    printOwner(printers.catalog),
    printOwner(printers.discovery),
    printOwner(printers.engagement),
    printOwner(printers.identity),
    printOwner(printers.playback),
  ]);
  const previous = await readGitBaseline(root, process.env["ASTER_SCHEMA_BASE"]);
  const artifacts = composeLocalSupergraph(
    { catalog, discovery, engagement, identity, playback },
    operations,
    previous?.api ?? baseline,
    previous?.operations,
    retainedOperations,
  );
  if (args[0] === "--write") {
    await writeArtifacts(directory, artifacts);
  }
  await verifyArtifacts(directory, artifacts);
  console.log(
    JSON.stringify({
      check: "supergraph",
      status: "ok",
      mode: args[0],
      subgraphs: 5,
      compatibilityBase: previous?.commit ?? "pre-supergraph",
      artifactCount: Object.keys(artifacts).length,
      manifestSha256: sha256(artifacts["manifest.json"] ?? ""),
    }),
  );
}

await run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Supergraph command failed.");
  process.exitCode = 1;
});
