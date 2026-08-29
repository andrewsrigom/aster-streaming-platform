import { createHash, randomUUID } from "node:crypto";

export function discoveryCacheDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function discoveryCacheToken(): string {
  return randomUUID().replaceAll("-", "");
}
