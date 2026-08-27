import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const API_PATH = "infra/router/generated/api.graphql";
const OPERATIONS_PATH = "infra/router/known-operations.graphql";

export async function readGitBaseline(root: string, requestedCommit?: string) {
  const git = async (args: string[], maxBuffer = 1_048_576) => {
    const result = await execute("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 5_000,
      killSignal: "SIGKILL",
      maxBuffer,
      windowsHide: true,
    });
    return result.stdout;
  };
  const commit =
    requestedCommit ?? (await git(["rev-parse", "--verify", "refs/heads/main"], 256)).trim();
  if (!/^[0-9a-f]{40}$/u.test(commit) || /^0+$/u.test(commit)) {
    throw new Error("Compatibility baseline must be a complete commit SHA.");
  }
  const paths = (
    await git(["ls-tree", "-r", "--name-only", commit, "--", API_PATH, OPERATIONS_PATH], 1_024)
  ).trim();
  if (!paths) {
    return undefined;
  }
  if (paths.split("\n").sort().join("\n") !== [API_PATH, OPERATIONS_PATH].sort().join("\n")) {
    throw new Error("Compatibility baseline is incomplete.");
  }
  const api = await git(["show", commit + ":" + API_PATH]);
  const operations = await git(["show", commit + ":" + OPERATIONS_PATH], 131_072);
  return { commit, api, operations };
}
