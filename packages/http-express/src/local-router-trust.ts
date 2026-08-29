import { timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";

export type AsterRouterOwner = "identity" | "catalog" | "playback" | "engagement" | "discovery";
interface AsterRouterContext {
  readonly traceId?: string;
  readonly correlationId?: string;
}
export interface AsterLocalRouterTrust {
  accept(request: IncomingMessage): AsterRouterContext | undefined;
}

const CREDENTIAL = /^[a-f0-9]{64}$/u;
const ROUTER_OWNERS = new Set<string>([
  "identity",
  "catalog",
  "playback",
  "engagement",
  "discovery",
]);
const TRACEPARENT = /^00-([a-f0-9]{32})-([a-f0-9]{16})-0[01]$/u;
const HOSTS = {
  identity: "identity:3100",
  catalog: "catalog:3200",
  playback: "playback:3300",
  engagement: "engagement:3400",
  discovery: "discovery:3500",
  "catalog-playback": "catalog:3200",
  "identity-engagement": "identity:3100",
  "playback-engagement": "playback:3300",
  "catalog-engagement": "catalog:3200",
  "catalog-discovery": "catalog:3200",
} as const;

/** Transport authentication only; no account, profile or operator authority. */
export function createLocalRouterTrust(
  owner: AsterRouterOwner,
  credential: string,
): AsterLocalRouterTrust {
  if (!ROUTER_OWNERS.has(owner)) {
    throw new Error("Invalid local Router owner.");
  }
  return createTransportTrust(owner, credential);
}

/** Separate read-only caller; never grants Router or viewer authority. */
export function createLocalCatalogPlaybackTrust(credential: string): AsterLocalRouterTrust {
  return createTransportTrust("catalog-playback", credential);
}

export function createLocalEngagementReadTrust(
  owner: "identity" | "playback" | "catalog",
  credential: string,
): AsterLocalRouterTrust {
  return createTransportTrust(`${owner}-engagement`, credential);
}

export function createLocalCatalogDiscoveryTrust(credential: string): AsterLocalRouterTrust {
  return createTransportTrust("catalog-discovery", credential);
}

function createTransportTrust(
  owner: keyof typeof HOSTS,
  credential: string,
): AsterLocalRouterTrust {
  if (!Object.hasOwn(HOSTS, owner) || !CREDENTIAL.test(credential)) {
    throw new Error("Invalid local Router trust configuration.");
  }
  const expected = Buffer.from(credential, "ascii");
  const engagement =
    owner === "identity-engagement" ||
    owner === "playback-engagement" ||
    owner === "catalog-engagement";
  const discovery = owner === "catalog-discovery";
  const correlatedRead = engagement || discovery;
  const credentialHeader = discovery
    ? "x-aster-discovery-credential"
    : engagement
      ? "x-aster-engagement-credential"
      : owner === "catalog-playback"
        ? "x-aster-playback-credential"
        : "x-aster-router-credential";
  const origin = discovery
    ? "http://discovery:3500"
    : engagement
      ? "http://engagement:3400"
      : owner === "catalog-playback"
        ? "http://playback:3300"
        : "http://127.0.0.1:4000";
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
            name !== credentialHeader &&
            !(correlatedRead && name === "x-aster-correlation-id")) ||
          (owner !== "identity" &&
            owner !== "identity-engagement" &&
            owner !== "engagement" &&
            name === "cookie")
        ) {
          return undefined;
        }
        headers.set(name, value);
      }
      const supplied = headers.get(credentialHeader) ?? "";
      if (
        headers.get("host") !== HOSTS[owner] ||
        headers.get("origin") !== origin ||
        headers.get("x-aster-csrf") !== "1" ||
        !CREDENTIAL.test(supplied) ||
        !timingSafeEqual(expected, Buffer.from(supplied, "ascii"))
      ) {
        return undefined;
      }
      const correlationId = correlatedRead ? headers.get("x-aster-correlation-id") : undefined;
      if (
        correlatedRead &&
        (!correlationId ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
            correlationId,
          ))
      ) {
        return undefined;
      }
      const context = correlationId ? { correlationId } : {};
      const traceparent = headers.get("traceparent");
      if (traceparent === undefined) {
        return context;
      }
      const match = TRACEPARENT.exec(traceparent);
      return match &&
        match[1] &&
        match[2] &&
        match[1] !== "0".repeat(32) &&
        match[2] !== "0".repeat(16)
        ? { ...context, traceId: match[1] }
        : undefined;
    },
  });
}

export async function loadLocalRouterTrust(
  owner: AsterRouterOwner,
  directory = "/run/aster-router",
): Promise<AsterLocalRouterTrust> {
  if (!ROUTER_OWNERS.has(owner)) {
    throw new Error("Invalid local Router owner.");
  }
  return createLocalRouterTrust(owner, await readCredential(join(directory, `${owner}.key`)));
}

export async function loadLocalCatalogPlaybackCredential(
  directory = "/run/aster-playback-catalog",
): Promise<string> {
  return readCredential(join(directory, "catalog.key"));
}

export async function loadLocalCatalogPlaybackTrust(
  directory = "/run/aster-playback-catalog",
): Promise<AsterLocalRouterTrust> {
  return createLocalCatalogPlaybackTrust(await loadLocalCatalogPlaybackCredential(directory));
}

export async function loadLocalCatalogDiscoveryCredential(
  directory = "/run/aster-discovery-catalog",
): Promise<string> {
  return readCredential(join(directory, "catalog.key"));
}

export async function loadLocalCatalogDiscoveryTrust(
  directory = "/run/aster-discovery-catalog",
): Promise<AsterLocalRouterTrust> {
  return createLocalCatalogDiscoveryTrust(await loadLocalCatalogDiscoveryCredential(directory));
}

export async function loadLocalEngagementReadCredential(
  owner: "identity" | "playback" | "catalog",
  directory = `/run/aster-engagement-${owner}`,
): Promise<string> {
  if (!new Set<string>(["identity", "playback", "catalog"]).has(owner)) {
    throw new Error("Invalid Engagement read owner.");
  }
  return readCredential(join(directory, `${owner}.key`));
}

async function readCredential(path: string): Promise<string> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
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
      const credential = buffer.subarray(0, 64).toString("utf8");
      if (!CREDENTIAL.test(credential)) {
        throw new Error("Invalid credential value.");
      }
      return credential;
    } finally {
      await file.close();
    }
  } catch {
    throw new Error("Local Router credential is unavailable.");
  }
}
