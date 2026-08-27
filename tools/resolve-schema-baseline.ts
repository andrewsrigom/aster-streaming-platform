import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const fullCommit = (value: string): boolean =>
  /^[a-f0-9]{40}$/u.test(value) && !/^0+$/u.test(value);

export async function resolveSchemaBaseline(root: string, requested?: string): Promise<string> {
  const git = async (...args: string[]): Promise<string> => {
    const { stdout } = await execute("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 1024,
      windowsHide: true,
    });
    const commit = stdout.trim();
    if (!fullCommit(commit)) {
      throw new Error("Schema baseline must resolve to a full commit SHA.");
    }
    return commit;
  };
  const head = await git("rev-parse", "--verify", "HEAD^{commit}");
  let baseline: string;
  if (requested) {
    if (!fullCommit(requested)) {
      throw new Error("Invalid event schema baseline.");
    }
    baseline = await git("rev-parse", "--verify", requested + "^{commit}");
  } else {
    baseline = await git("merge-base", head, "refs/remotes/origin/main");
    if (baseline === head) {
      baseline = await git("rev-parse", "--verify", head + "^1");
    }
  }
  if (baseline === head) {
    throw new Error("Schema compatibility cannot compare the candidate with itself.");
  }
  return baseline;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) {
      throw new Error("Unexpected schema baseline arguments.");
    }
    const baseline = await resolveSchemaBaseline(process.cwd(), process.env["ASTER_SCHEMA_BASE"]);
    process.stdout.write(baseline + "\n");
  } catch {
    process.stderr.write("Unable to select a distinct schema baseline; check Git history.\n");
    process.exitCode = 1;
  }
}
