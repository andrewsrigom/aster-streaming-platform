import { fileURLToPath } from "node:url";
import { verifyPublicBuild } from "./public-artifacts.ts";

try {
  const result = await verifyPublicBuild(
    fileURLToPath(new URL("../.next/static", import.meta.url)),
  );
  console.log(JSON.stringify({ check: "web-public-build", ...result, findings: 0 }));
} catch {
  console.error("Public build verification failed. Inspect locally; artifact values are redacted.");
  process.exitCode = 1;
}
