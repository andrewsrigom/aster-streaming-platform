import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

async function verifyExisting(path) {
  const existing = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await existing.stat();
    const buffer = Buffer.alloc(65);
    if (!stat.isFile() || stat.size !== 64 || (stat.mode & 0o077) !== 0) {
      throw new Error("Invalid Router trust file.");
    }
    const { bytesRead } = await existing.read(buffer, 0, 65, 0);
    if (bytesRead !== 64 || !/^[a-f0-9]{64}$/.test(buffer.subarray(0, 64).toString("utf8"))) {
      throw new Error("Invalid Router trust file.");
    }
  } finally {
    await existing.close();
  }
}

const eventTrust = process.env.ASTER_IDENTITY_EVENTS_TRUST_ENABLED;
if (eventTrust !== undefined && eventTrust !== "true" && eventTrust !== "false") {
  throw new Error("Invalid Identity event trust activation.");
}
// A finite local initializer. Retained event signatures require retaining the original event key.
const paths = [
  ...["identity", "catalog", "playback", "engagement", "discovery"].map(
    (owner) => `/run/aster-router/${owner}/${owner}.key`,
  ),
  "/run/aster-playback-catalog/catalog.key",
  "/run/aster-engagement-identity/identity.key",
  "/run/aster-engagement-playback/playback.key",
  "/run/aster-engagement-catalog/catalog.key",
  "/run/aster-discovery-catalog/catalog.key",
  ...(eventTrust === "true" ? ["/run/aster-identity-events/identity.key"] : []),
];
for (const path of paths) {
  let file;
  try {
    file = await open(path, "wx", 0o400);
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
    await verifyExisting(path);
    continue;
  }
  try {
    await file.writeFile(randomBytes(32).toString("hex"), "utf8");
  } finally {
    await file.close();
  }
}
process.stdout.write(
  JSON.stringify({
    event: "aster.router.trust_initialized",
    owners: 5,
    ownerReads: 5,
    identityEvents: eventTrust === "true",
  }) + "\n",
);
