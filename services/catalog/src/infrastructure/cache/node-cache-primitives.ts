import { createHash, randomUUID } from "node:crypto";

export const catalogCacheDigest = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

export const catalogCacheToken = (): string => randomUUID();
