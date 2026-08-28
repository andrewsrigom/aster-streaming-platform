import { request, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import type {
  ProgressPorts,
  ProgressCatalog,
  ProgressRequest,
  ProgressResult,
} from "../application/progress-ports.js";
import { progressIdentifier } from "../domain/progress.js";

type Owner = "identity" | "playback" | "catalog";
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
  catalog: {
    port: 3200,
    operationName: "EngagementTitles",
    field: "_engagementTitles",
    query:
      "query EngagementTitles($ids: [ID!]!) { _engagementTitles(ids: $ids) { code checkedAt expiresAt titles { titleId visible } } }",
    fields: ["code", "checkedAt", "expiresAt", "titles"],
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

/** Fixed owner reads; no endpoint, headers, redirects or retries from application input. */
export function createProgressOwnerClients(
  options: Readonly<{
    identityCredential: string;
    playbackCredential: string;
    catalogCredential: string;
    request?: Send;
  }>,
): Pick<ProgressPorts, "identity" | "playback"> & Readonly<{ catalog: ProgressCatalog }> {
  if (
    ![options.identityCredential, options.playbackCredential, options.catalogCredential].every(
      (value) => /^[a-f0-9]{64}$/u.test(value),
    ) ||
    new Set([options.identityCredential, options.playbackCredential, options.catalogCredential])
      .size !== 3
  ) {
    throw new Error("Invalid Engagement owner credentials.");
  }
  const credentials = {
    identity: options.identityCredential,
    playback: options.playbackCredential,
    catalog: options.catalogCredential,
  };
  const send = options.request ?? request;
  const active: Record<Owner, number> = { identity: 0, playback: 0, catalog: 0 };
  async function read(
    owner: Owner,
    variables: Record<string, string | readonly string[]>,
    context: OwnerRequest,
    credential?: string,
  ): Promise<ProgressResult<Record<string, unknown>>> {
    if (context.signal.aborted) {
      return { status: "cancelled" };
    }
    if (
      !progressIdentifier(context.correlationId) ||
      !Object.values(variables).every((value) =>
        Array.isArray(value)
          ? value.length >= 1 && value.length <= 20 && value.every(progressIdentifier)
          : progressIdentifier(value),
      ) ||
      (context.traceparent !== undefined &&
        (!/^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/u.test(context.traceparent) ||
          context.traceparent.slice(3, 35) === "0".repeat(32) ||
          context.traceparent.slice(36, 52) === "0".repeat(16)))
    ) {
      return { status: "invalid_input" };
    }
    if (active[owner] >= (owner === "catalog" ? 1 : 4)) {
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
    catalog: {
      async visibility(ids, context) {
        if (
          !Array.isArray(ids) ||
          ids.length < 1 ||
          ids.length > 20 ||
          Array.from({ length: ids.length }, (_, index) =>
            Object.getOwnPropertyDescriptor(ids, String(index)),
          ).some((entry) => !entry || !("value" in entry) || !progressIdentifier(entry.value))
        ) {
          return { status: "invalid_input" };
        }
        const result = await read("catalog", { ids }, context);
        if (result.status !== "completed") {
          return result;
        }
        const { checkedAt, expiresAt, titles } = result.value;
        if (
          !validTime(checkedAt) ||
          !validTime(expiresAt) ||
          expiresAt !== checkedAt + 2 ||
          !Array.isArray(titles) ||
          titles.length !== ids.length
        ) {
          return { status: "unavailable" };
        }
        const entries: { titleId: string; visible: boolean }[] = [];
        for (const [index, raw] of titles.entries()) {
          if (
            !exact(raw, ["titleId", "visible"]) ||
            !progressIdentifier(raw["titleId"]) ||
            raw["titleId"] !== ids[index] ||
            typeof raw["visible"] !== "boolean"
          ) {
            return { status: "unavailable" };
          }
          entries.push(Object.freeze({ titleId: raw["titleId"], visible: raw["visible"] }));
        }
        return {
          status: "completed",
          value: Object.freeze({ checkedAt, expiresAt, titles: Object.freeze(entries) }),
        };
      },
    },
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
