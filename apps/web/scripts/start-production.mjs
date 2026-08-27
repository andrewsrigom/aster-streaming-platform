import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL(".next/standalone/apps/web/", root);
await cp(new URL(".next/static", root), new URL(".next/static", output), { recursive: true });
if (existsSync(new URL("public", root))) {
  await cp(new URL("public", root), new URL("public", output), { recursive: true });
}
process.env["HOSTNAME"] = "127.0.0.1";
process.env["PORT"] = "3000";
process.chdir(fileURLToPath(output));
await import(new URL("server.js", output).href);
