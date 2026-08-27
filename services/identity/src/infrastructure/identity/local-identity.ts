import { generateKeyPair, jwtVerify, SignJWT } from "jose";

import type { ValidatedIdentityAssertion } from "../../domain/identity-assertion.js";

export const LOCAL_IDENTITY_ISSUER = "urn:aster:local-identity";
export const LOCAL_IDENTITY_AUDIENCE = "aster:identity-session";
export const LOCAL_IDENTITY_SUBJECT = "aster-demo-viewer";
export const LOCAL_IDENTITY_TYPE = "aster-local-session+jwt";
export const LOCAL_SESSION_LIFETIME_SECONDS = 1_800;
const MAX_TOKEN_BYTES = 4_096;
const MAX_CRYPTO_OPERATIONS = 8;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const COMPACT_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

type PublicKey = Awaited<ReturnType<typeof generateKeyPair>>["publicKey"];
type Clock = () => number;
export type IdentityBoundaryResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "unauthenticated" | "invalid_input" | "cancelled" | "unavailable" }>;

export interface LocalIdentityConfiguration {
  readonly environment: string;
  readonly localDemoEnabled: unknown;
  readonly publicOrigin: string;
}

export class AsterLocalIdentityConfigurationError extends Error {
  readonly code = "ASTER_LOCAL_IDENTITY_INVALID";

  constructor() {
    super("Local identity configuration is invalid.");
    this.name = "AsterLocalIdentityConfigurationError";
  }
}

export function validateLocalIdentityConfiguration(
  configuration: LocalIdentityConfiguration,
): void {
  try {
    if (typeof configuration.publicOrigin !== "string" || configuration.publicOrigin.length > 128) {
      throw new AsterLocalIdentityConfigurationError();
    }
    const origin = new URL(configuration.publicOrigin);
    const port = Number(origin.port);
    if (
      configuration.environment !== "local" ||
      configuration.localDemoEnabled !== true ||
      origin.protocol !== "http:" ||
      origin.hostname !== "127.0.0.1" ||
      origin.origin !== configuration.publicOrigin ||
      port < 1_024 ||
      port > 65_535
    ) {
      throw new AsterLocalIdentityConfigurationError();
    }
  } catch {
    throw new AsterLocalIdentityConfigurationError();
  }
}

function createCryptoBoundary(now: Clock) {
  let active = 0;
  return async function run<T>(
    signal: AbortSignal,
    failure: "unauthenticated" | "unavailable",
    operation: (timestamp: number) => Promise<T>,
  ): Promise<IdentityBoundaryResult<T>> {
    const cancelled = (): boolean => signal.aborted;
    if (cancelled()) {
      return { status: "cancelled" };
    }
    if (active >= MAX_CRYPTO_OPERATIONS) {
      return { status: "unavailable" };
    }
    active += 1;
    try {
      let timestamp: number;
      try {
        timestamp = now();
        if (
          !Number.isSafeInteger(timestamp) ||
          timestamp < 0 ||
          timestamp > 8_640_000_000_000 - LOCAL_SESSION_LIFETIME_SECONDS
        ) {
          return { status: "unavailable" };
        }
      } catch {
        return { status: "unavailable" };
      }
      const value = await operation(timestamp);
      return cancelled() ? { status: "cancelled" } : { status: "completed", value };
    } catch {
      return { status: cancelled() ? "cancelled" : failure };
    } finally {
      // Native crypto cannot be stopped; its slot remains owned until it actually settles.
      active -= 1;
    }
  };
}

function verifier(publicKey: PublicKey, run: ReturnType<typeof createCryptoBoundary>) {
  return (
    token: unknown,
    signal: AbortSignal,
  ): Promise<IdentityBoundaryResult<ValidatedIdentityAssertion>> => {
    if (signal.aborted) {
      return Promise.resolve({ status: "cancelled" });
    }
    if (typeof token !== "string" || token.length > MAX_TOKEN_BYTES || !COMPACT_JWT.test(token)) {
      return Promise.resolve({ status: "unauthenticated" });
    }
    return run(signal, "unauthenticated", async (timestamp) => {
      const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
        algorithms: ["ES256"],
        issuer: LOCAL_IDENTITY_ISSUER,
        audience: LOCAL_IDENTITY_AUDIENCE,
        typ: LOCAL_IDENTITY_TYPE,
        requiredClaims: ["iss", "sub", "aud", "iat", "exp", "jti"],
        currentDate: new Date(timestamp * 1_000),
        clockTolerance: 0,
      });
      const issuedAt = payload.iat;
      const expiresAt = payload.exp;
      if (
        Object.keys(protectedHeader).some((key) => key !== "alg" && key !== "typ") ||
        protectedHeader.typ !== LOCAL_IDENTITY_TYPE ||
        payload.aud !== LOCAL_IDENTITY_AUDIENCE ||
        payload.sub !== LOCAL_IDENTITY_SUBJECT ||
        typeof payload.jti !== "string" ||
        !SESSION_ID.test(payload.jti) ||
        typeof issuedAt !== "number" ||
        typeof expiresAt !== "number" ||
        !Number.isSafeInteger(issuedAt) ||
        !Number.isSafeInteger(expiresAt) ||
        issuedAt < 0 ||
        issuedAt > timestamp ||
        expiresAt <= issuedAt ||
        expiresAt - issuedAt > LOCAL_SESSION_LIFETIME_SECONDS
      ) {
        throw new Error("Invalid local identity assertion.");
      }
      return Object.freeze({
        issuer: LOCAL_IDENTITY_ISSUER,
        subject: LOCAL_IDENTITY_SUBJECT,
        sessionId: payload.jti,
        issuedAt,
        expiresAt,
      });
    });
  };
}

const currentSeconds: Clock = () => Math.floor(Date.now() / 1_000);

// The key is trusted composition input, never decoded from a caller's token or URL.
export function createLocalAssertionVerifier(publicKey: PublicKey, now: Clock = currentSeconds) {
  return verifier(publicKey, createCryptoBoundary(now));
}

export async function createLocalIdentityAdapter(
  configuration: LocalIdentityConfiguration,
  now: Clock = currentSeconds,
) {
  validateLocalIdentityConfiguration(configuration);
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  try {
    keys = await generateKeyPair("ES256", { extractable: false });
  } catch {
    throw new Error("Local identity initialization failed.");
  }
  const { publicKey, privateKey } = keys;
  const run = createCryptoBoundary(now);
  return Object.freeze({
    verify: verifier(publicKey, run),
    issue(sessionId: string, signal: AbortSignal): Promise<IdentityBoundaryResult<string>> {
      if (signal.aborted) {
        return Promise.resolve({ status: "cancelled" });
      }
      if (typeof sessionId !== "string" || sessionId.length !== 36 || !SESSION_ID.test(sessionId)) {
        return Promise.resolve({ status: "invalid_input" });
      }
      return run(signal, "unavailable", (timestamp) =>
        new SignJWT({})
          .setProtectedHeader({ alg: "ES256", typ: LOCAL_IDENTITY_TYPE })
          .setIssuer(LOCAL_IDENTITY_ISSUER)
          .setAudience(LOCAL_IDENTITY_AUDIENCE)
          .setSubject(LOCAL_IDENTITY_SUBJECT)
          .setJti(sessionId)
          .setIssuedAt(timestamp)
          .setExpirationTime(timestamp + LOCAL_SESSION_LIFETIME_SECONDS)
          .sign(privateKey),
      );
    },
  });
}
