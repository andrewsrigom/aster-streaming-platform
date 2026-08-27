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

// A finite local initializer. Restart all consumers together after rotating these files.
for (const owner of ["identity", "catalog"]) {
  const path = `/run/aster-router/${owner}/${owner}.key`;
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
process.stdout.write('{"event":"aster.router.trust_initialized","owners":2}\n');
