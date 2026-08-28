import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { setTimeout, clearTimeout } from "node:timers";
import { createProbeServer } from "./media/probe-server.mjs";

const [bundleHash, mode, ...rest] = process.argv.slice(2);
assert.ok(rest.length === 0 && (!mode || mode === "--container"));
assert.ok(!process.env.CI, "The media probe is local-only.");
if (mode) {
  await access("/.dockerenv");
}
const server = await createProbeServer(bundleHash);
const stop = () => {
  clearTimeout(deadline);
  server.close();
  server.closeAllConnections();
};
const deadline = setTimeout(stop, 15 * 60 * 1000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
server.once("error", () => {
  stop();
  process.stderr.write("Media probe could not bind its local port.\n");
  process.exitCode = 1;
});
server.listen(3000, mode ? "0.0.0.0" : "127.0.0.1", () => {
  process.stdout.write(
    JSON.stringify({ event: "media_probe_ready", url: "http://127.0.0.1:3000", bundleHash }) + "\n",
  );
});
