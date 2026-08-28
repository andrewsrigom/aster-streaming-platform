import { request, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import type {
  ProgressPorts,
  ProgressRequest,
  ProgressResult,
} from "../application/progress-ports.js";
import { progressIdentifier } from "../domain/progress.js";

type Owner = "identity" | "playback";
type OwnerRequest = Pick<ProgressRequest, "signal" | "correlationId" | "traceparent">;
type Send = (
  options: RequestOptions,
  response: (message: IncomingMessage) => void,
) => ClientRequest;
const CONTRACTS = {
  identity: {
    port: 3100,
    operationName: "EngagementProfile",
    field: "_engagementProfile",
    query:
      "query EngagementProfile($profileId: ID!) { _engagementProfile(profileId: $profileId) { code accountId profileId checkedAt expiresAt } }",
    fields: ["code", "accountId", "profileId", "checkedAt", "expiresAt"],
  },
  playback: {
    port: 3300,
    operationName: "EngagementSession",
    field: "_engagementSession",
    query:
      "query EngagementSession($sessionId: ID!, $titleId: ID!) { _engagementSession(sessionId: $sessionId, titleId: $titleId) { code sessionId titleId checkedAt createdAt expiresAt } }",
    fields: ["code", "sessionId", "titleId", "checkedAt", "createdAt", "expiresAt"],
  },
} as const;
const MAX_RESPONSE = 4096;
const validTime = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 253_402_300_799;
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}
function outcome(value: unknown): ProgressResult<never> {
  switch (value) {
    case "UNAUTHENTICATED":
      return { status: "unauthenticated" };
    case "NOT_FOUND":
      return { status: "not_found" };
    case "NOT_PLAYABLE":
      return { status: "not_playable" };
    case "INVALID_INPUT":
      return { status: "invalid_input" };
    case "CANCELLED":
      return { status: "cancelled" };
    case "BACKPRESSURE":
    case "LIMIT_EXCEEDED":
      return { status: "backpressure" };
    default:
      return { status: "unavailable" };
  }
}

/** Two fixed owner reads; no endpoint, headers, redirects or retries from application input. */
export function createProgressOwnerClients(
  options: Readonly<{
    identityCredential: string;
    playbackCredential: string;
    request?: Send;
  }>,
): Pick<ProgressPorts, "identity" | "playback"> {
  if (
    ![options.identityCredential, options.playbackCredential].every((value) =>
      /^[a-f0-9]{64}$/u.test(value),
    ) ||
    options.identityCredential === options.playbackCredential
  ) {
    throw new Error("Invalid Engagement owner credentials.");
  }
  const credentials = {
    identity: options.identityCredential,
    playback: options.playbackCredential,
  };
  const send = options.request ?? request;
  const active: Record<Owner, number> = { identity: 0, playback: 0 };
  async function read(
    owner: Owner,
    variables: Record<string, string>,
    context: OwnerRequest,
    credential?: string,
  ): Promise<ProgressResult<Record<string, unknown>>> {
    if (context.signal.aborted) {
      return { status: "cancelled" };
    }
    if (
      !progressIdentifier(context.correlationId) ||
      !Object.values(variables).every(progressIdentifier) ||
      (context.traceparent !== undefined &&
        (!/^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/u.test(context.traceparent) ||
          context.traceparent.slice(3, 35) === "0".repeat(32) ||
          context.traceparent.slice(36, 52) === "0".repeat(16)))
    ) {
      return { status: "invalid_input" };
    }
    if (active[owner] >= 4) {
      return { status: "backpressure" };
    }
    active[owner]++;
    const contract = CONTRACTS[owner];
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(2000)]);
    try {
      return await new Promise((resolve) => {
        let outgoing: ClientRequest | undefined;
        let incoming: IncomingMessage | undefined;
        let settled = false;
        const finish = (value: ProgressResult<Record<string, unknown>>) => {
          if (settled) {
            return;
          }
          settled = true;
          signal.removeEventListener("abort", fail);
          incoming?.destroy();
          outgoing?.destroy();
          resolve(value);
        };
        const fail = () => {
          finish({ status: context.signal.aborted ? "cancelled" : "unavailable" });
        };
        signal.addEventListener("abort", fail, { once: true });
        if (signal.aborted) {
          fail();
          return;
        }
        const payload = JSON.stringify({
          query: contract.query,
          operationName: contract.operationName,
          variables,
        });
        try {
          outgoing = send(
            {
              protocol: "http:",
              hostname: owner,
              port: contract.port,
              path: "/graphql",
              method: "POST",
              agent: false,
              signal,
              maxHeaderSize: 8192,
              headers: {
                host: `${owner}:${contract.port}`,
                origin: "http://engagement:3400",
                "x-aster-csrf": "1",
                "x-aster-engagement-credential": credentials[owner],
                "x-aster-correlation-id": context.correlationId,
                ...(context.traceparent ? { traceparent: context.traceparent } : {}),
                ...(owner === "identity" && credential
                  ? { cookie: `aster_local_session=${credential}` }
                  : {}),
                "content-type": "application/json",
                accept: "application/json",
                "content-length": Buffer.byteLength(payload),
                connection: "close",
              },
            },
            (response) => {
              incoming = response;
              response.once("error", fail);
              response.once("aborted", fail);
              const bytes = response.headers["content-length"];
              if (
                settled ||
                signal.aborted ||
                response.statusCode !== 200 ||
                response.headers["content-encoding"] !== undefined ||
                response.headers["set-cookie"] !== undefined ||
                !["application/json", "application/graphql-response+json"].includes(
                  response.headers["content-type"]?.split(";", 1)[0]?.trim() ?? "",
                ) ||
                (bytes !== undefined &&
                  (!/^[0-9]{1,4}$/u.test(bytes) || Number(bytes) > MAX_RESPONSE))
              ) {
                fail();
                response.destroy();
                return;
              }
              const chunks: Buffer[] = [];
              let received = 0;
              response.on("data", (chunk: Buffer) => {
                received += chunk.length;
                if (received > MAX_RESPONSE) {
                  fail();
                  return;
                }
                chunks.push(chunk);
              });
              response.once("end", () => {
                if (signal.aborted || !response.complete) {
                  fail();
                  return;
                }
                try {
                  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                  if (!exact(value, ["data"]) || !exact(value["data"], [contract.field])) {
                    fail();
                    return;
                  }
                  const result: unknown = value["data"][contract.field];
                  if (!exact(result, contract.fields)) {
                    fail();
                    return;
                  }
                  finish(
                    result["code"] === "COMPLETED"
                      ? { status: "completed", value: result }
                      : outcome(result["code"]),
                  );
                } catch {
                  fail();
                }
              });
            },
          );
          outgoing.once("error", fail);
          outgoing.end(payload);
        } catch {
          fail();
        }
      });
    } finally {
      active[owner]--;
    }
  }
  return {
    identity: {
      async authorizeProfile(credential, profileId, context) {
        if (
          credential.length > 3800 ||
          !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(credential)
        ) {
          return { status: "unauthenticated" };
        }
        const result = await read("identity", { profileId }, context, credential);
        if (result.status !== "completed") {
          return result;
        }
        const value = result.value;
        if (
          !progressIdentifier(value["accountId"]) ||
          value["profileId"] !== profileId ||
          !validTime(value["checkedAt"]) ||
          !validTime(value["expiresAt"]) ||
          value["expiresAt"] <= value["checkedAt"]
        ) {
          return { status: "unavailable" };
        }
        return {
          status: "completed",
          value: {
            accountId: value["accountId"],
            profileId,
            checkedAt: value["checkedAt"],
            expiresAt: value["expiresAt"],
          },
        };
      },
    },
    playback: {
      async inspect(sessionId, titleId, context) {
        const result = await read("playback", { sessionId, titleId }, context);
        if (result.status !== "completed") {
          return result;
        }
        const value = result.value;
        if (
          value["sessionId"] !== sessionId ||
          value["titleId"] !== titleId ||
          !validTime(value["createdAt"]) ||
          !validTime(value["expiresAt"]) ||
          !validTime(value["checkedAt"]) ||
          value["createdAt"] > value["checkedAt"] ||
          value["expiresAt"] <= value["checkedAt"]
        ) {
          return { status: "unavailable" };
        }
        return {
          status: "completed",
          value: {
            sessionId,
            titleId,
            createdAt: value["createdAt"],
            checkedAt: value["checkedAt"],
            expiresAt: value["expiresAt"],
          },
        };
      },
    },
  };
}
