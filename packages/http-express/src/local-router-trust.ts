import { timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";

export type AsterRouterOwner = "identity" | "catalog";
interface AsterRouterContext {
  readonly traceId?: string;
}
export interface AsterLocalRouterTrust {
  accept(request: IncomingMessage): AsterRouterContext | undefined;
}

const CREDENTIAL = /^[a-f0-9]{64}$/u;
const TRACEPARENT = /^00-([a-f0-9]{32})-([a-f0-9]{16})-0[01]$/u;
const HOSTS = { identity: "identity:3100", catalog: "catalog:3200" } as const;

/** Transport authentication only; no account, profile or operator authority. */
export function createLocalRouterTrust(
  owner: AsterRouterOwner,
  credential: string,
): AsterLocalRouterTrust {
  if (!Object.hasOwn(HOSTS, owner) || !CREDENTIAL.test(credential)) {
    throw new Error("Invalid local Router trust configuration.");
  }
  const expected = Buffer.from(credential, "ascii");
  return Object.freeze({
    accept(request: IncomingMessage): AsterRouterContext | undefined {
      if (
        request.method !== "POST" ||
        request.url !== "/graphql" ||
        request.rawHeaders.length > 128 ||
        request.rawHeaders.length % 2 !== 0
      ) {
        return undefined;
      }
      const headers = new Map<string, string>();
      let bytes = 0;
      for (let i = 0; i < request.rawHeaders.length; i += 2) {
        const name = request.rawHeaders[i]?.toLowerCase();
        const value = request.rawHeaders[i + 1];
        if (!name || value === undefined || headers.has(name)) {
          return undefined;
        }
        bytes += name.length + value.length + 4;
        if (
          bytes > 16384 ||
          name.length > 128 ||
          !/^[\t\x20-\x7e]*$/u.test(value) ||
          name === "authorization" ||
          name === "forwarded" ||
          name === "baggage" ||
          // Empty W3C vendor state conveys no context; nonempty vendor state is not trusted.
          (name === "tracestate" && value !== "") ||
          name.startsWith("x-forwarded-") ||
          (name.startsWith("x-aster-") &&
            name !== "x-aster-csrf" &&
            name !== "x-aster-router-credential") ||
          (owner === "catalog" && name === "cookie")
        ) {
          return undefined;
        }
        headers.set(name, value);
      }
      const supplied = headers.get("x-aster-router-credential") ?? "";
      if (
        headers.get("host") !== HOSTS[owner] ||
        headers.get("origin") !== "http://127.0.0.1:4000" ||
        headers.get("x-aster-csrf") !== "1" ||
        !CREDENTIAL.test(supplied) ||
        !timingSafeEqual(expected, Buffer.from(supplied, "ascii"))
      ) {
        return undefined;
      }
      const traceparent = headers.get("traceparent");
      if (traceparent === undefined) {
        return {};
      }
      const match = TRACEPARENT.exec(traceparent);
      return match &&
        match[1] &&
        match[2] &&
        match[1] !== "0".repeat(32) &&
        match[2] !== "0".repeat(16)
        ? { traceId: match[1] }
        : undefined;
    },
  });
}

export async function loadLocalRouterTrust(
  owner: AsterRouterOwner,
  directory = "/run/aster-router",
): Promise<AsterLocalRouterTrust> {
  if (!Object.hasOwn(HOSTS, owner)) {
    throw new Error("Invalid local Router owner.");
  }
  try {
    const file = await open(
      join(directory, `${owner}.key`),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== 64 || (stat.mode & 0o077) !== 0) {
        throw new Error("Invalid credential file.");
      }
      const buffer = Buffer.alloc(65);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead !== 64) {
        throw new Error("Invalid credential size.");
      }
      return createLocalRouterTrust(owner, buffer.subarray(0, 64).toString("utf8"));
    } finally {
      await file.close();
    }
  } catch {
    throw new Error("Local Router credential is unavailable.");
  }
}
