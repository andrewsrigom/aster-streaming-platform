import type { IncomingMessage } from "node:http";

import type { AsterExpressGraphqlMiddleware, AsterLocalRouterTrust } from "@aster/http-express";

import {
  LOCAL_SESSION_LIFETIME_SECONDS,
  validateLocalIdentityConfiguration,
  type LocalIdentityConfiguration,
} from "../infrastructure/identity/local-identity.js";

const COOKIE_NAME = "aster_local_session";
const COOKIE_ATTRIBUTES = "Path=/; HttpOnly; SameSite=Strict";
const MAX_CREDENTIAL_BYTES = 3_800;
const COMPACT_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const HEADER_NAME = /^[!#$%&'*+\-.^_\x60|~0-9A-Za-z]+$/u;
const COOKIE_VALUE =
  /^(?:"[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*"|[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*)$/u;
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset=(?:"utf-8"|utf-8))?$/iu;

type AcceptedRequest = Readonly<{ credential: string | undefined; traceId?: string }>;
type Decision =
  | Readonly<{ status: "accepted"; value: AcceptedRequest }>
  | Readonly<{ status: "rejected"; httpStatus: 400 | 403 | 405 | 415; code: string }>;

function readHeaders(request: IncomingMessage): Map<string, string> | undefined {
  const raw = request.rawHeaders;
  if (raw.length % 2 !== 0 || raw.length > 128) {
    return undefined;
  }
  const result = new Map<string, string>();
  let bytes = 0;
  for (let index = 0; index < raw.length; index += 2) {
    const name = raw[index];
    const value = raw[index + 1];
    if (
      name === undefined ||
      value === undefined ||
      name.length > 128 ||
      !HEADER_NAME.test(name) ||
      !/^[\t\x20-\x7e]*$/u.test(value)
    ) {
      return undefined;
    }
    bytes += name.length + value.length + 4;
    const key = name.toLowerCase();
    if (bytes > 16_384 || result.has(key)) {
      return undefined;
    }
    result.set(key, value);
  }
  return result;
}

function readCookie(raw: string | undefined): AcceptedRequest | undefined {
  if (raw === undefined) {
    return { credential: undefined };
  }
  if (raw.length === 0 || raw.length > 8_192) {
    return undefined;
  }
  const pairs = raw.split(";");
  if (pairs.length > 32) {
    return undefined;
  }
  const names = new Set<string>();
  let credential: string | undefined;
  for (const pair of pairs) {
    const field = pair.trim();
    const equals = field.indexOf("=");
    const name = field.slice(0, equals);
    const value = field.slice(equals + 1);
    if (
      equals < 1 ||
      name.length > 128 ||
      !HEADER_NAME.test(name) ||
      !COOKIE_VALUE.test(value) ||
      names.has(name)
    ) {
      return undefined;
    }
    names.add(name);
    if (name === COOKIE_NAME) {
      if (value.length > MAX_CREDENTIAL_BYTES || !COMPACT_JWT.test(value)) {
        return undefined;
      }
      credential = value;
    }
  }
  return { credential };
}

function authorizeRequest(
  request: IncomingMessage,
  origin: URL,
  routerTrust?: AsterLocalRouterTrust,
): Decision {
  const reject = (httpStatus: 400 | 403 | 405 | 415, code: string): Decision => ({
    status: "rejected",
    httpStatus,
    code,
  });
  if (request.method !== "POST") {
    return reject(405, "HTTP_METHOD_NOT_ALLOWED");
  }
  const headers = readHeaders(request);
  if (!headers || request.url !== "/graphql") {
    return reject(400, "BAD_REQUEST");
  }
  const routerContext = routerTrust?.accept(request);
  if (
    (routerTrust ? !routerContext : headers.get("host") !== origin.host) ||
    headers.get("origin") !== origin.origin ||
    headers.get("x-aster-csrf") !== "1" ||
    (headers.has("sec-fetch-site") && headers.get("sec-fetch-site") !== "same-origin") ||
    [...headers.keys()].some(
      (name) =>
        name === "authorization" ||
        name === "forwarded" ||
        name.startsWith("x-forwarded-") ||
        (name.startsWith("x-aster-") &&
          name !== "x-aster-csrf" &&
          !(routerTrust && name === "x-aster-router-credential")),
    )
  ) {
    return reject(403, "FORBIDDEN");
  }
  const encoding = headers.get("content-encoding");
  if (
    !JSON_CONTENT_TYPE.test(headers.get("content-type") ?? "") ||
    (encoding !== undefined && encoding.toLowerCase() !== "identity")
  ) {
    return reject(415, "UNSUPPORTED_MEDIA_TYPE");
  }
  const cookies = readCookie(headers.get("cookie"));
  return cookies
    ? { status: "accepted", value: { ...cookies, ...routerContext } }
    : reject(400, "BAD_REQUEST");
}

export function createLocalSessionTransport(
  configuration: LocalIdentityConfiguration,
  now: () => number = () => Math.floor(Date.now() / 1_000),
  routerTrust?: AsterLocalRouterTrust,
) {
  validateLocalIdentityConfiguration(configuration);
  const origin = new URL(configuration.publicOrigin);
  if (routerTrust && origin.origin !== "http://127.0.0.1:4000") {
    throw new Error("Invalid local Router public origin.");
  }
  const accepted = new WeakMap<IncomingMessage, AcceptedRequest>();
  return Object.freeze({
    wrap(next: AsterExpressGraphqlMiddleware): AsterExpressGraphqlMiddleware {
      return (request, response, onError) => {
        response.set("Cache-Control", "no-store");
        response.set("X-Content-Type-Options", "nosniff");
        const decision = authorizeRequest(request, origin, routerTrust);
        if (decision.status !== "accepted") {
          if (decision.httpStatus === 405) {
            response.set("Allow", "POST");
          }
          response.status(decision.httpStatus).json({
            errors: [{ message: "Request rejected.", extensions: { code: decision.code } }],
          });
          return;
        }
        accepted.set(request, decision.value);
        // The custom header is a preflight requirement, not a secret or authentication claim.
        return next(request, response, onError);
      };
    },
    credential(request: IncomingMessage): string | undefined {
      if (!accepted.has(request)) {
        throw new Error("Local session request context is unavailable.");
      }
      return accepted.get(request)?.credential;
    },
    traceId(request: IncomingMessage): string | undefined {
      return accepted.get(request)?.traceId;
    },
    issueCookie(credential: string, expiresAt: number): string {
      const timestamp = now();
      if (
        typeof credential !== "string" ||
        credential.length > MAX_CREDENTIAL_BYTES ||
        !COMPACT_JWT.test(credential) ||
        !Number.isSafeInteger(timestamp) ||
        timestamp < 0 ||
        !Number.isSafeInteger(expiresAt) ||
        expiresAt > 253_402_300_799 ||
        expiresAt <= timestamp ||
        expiresAt - timestamp > LOCAL_SESSION_LIFETIME_SECONDS
      ) {
        throw new Error("Local session cookie is invalid.");
      }
      return `${COOKIE_NAME}=${credential}; ${COOKIE_ATTRIBUTES}; Max-Age=${expiresAt - timestamp}; Expires=${new Date(expiresAt * 1_000).toUTCString()}`;
    },
    clearCookie(): string {
      return `${COOKIE_NAME}=; ${COOKIE_ATTRIBUTES}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    },
  });
}
