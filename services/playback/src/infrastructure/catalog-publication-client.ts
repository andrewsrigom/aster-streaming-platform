import { request, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import type { PublicationLookup } from "../application/session-ports.js";
import { playbackIdentifier } from "../domain/session.js";

const OPERATION =
  "query PlaybackPublications($ids: [ID!]!) { _playbackPublications(ids: $ids) { titleId publicationId titleVersion manifestUrl checkedAt validUntil } }";
const MAX_RESPONSE_BYTES = 8192;

type CatalogRequest = (
  options: RequestOptions,
  response: (message: IncomingMessage) => void,
) => ClientRequest;

function onlyField(value: unknown, field: string): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    Object.hasOwn(value, field)
  );
}

/** Fixed owner endpoint and operation, with no redirects, media fetches or retries. */
export function createCatalogPublicationClient(
  options: Readonly<{
    credential: string;
    request?: CatalogRequest;
  }>,
) {
  if (!/^[a-f0-9]{64}$/u.test(options.credential)) {
    throw new Error("Invalid Catalog read credential.");
  }
  const send = options.request ?? request;
  let inFlight = 0;
  return Object.freeze({
    async currentPublication(titleId: string, signal: AbortSignal): Promise<PublicationLookup> {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      if (!playbackIdentifier(titleId) || inFlight >= 4) {
        return { status: "unavailable" };
      }
      inFlight += 1;
      const active = AbortSignal.any([signal, AbortSignal.timeout(1500)]);
      try {
        return await new Promise<PublicationLookup>((resolve) => {
          let outgoing: ClientRequest | undefined;
          let incoming: IncomingMessage | undefined;
          let settled = false;
          const finish = (result: PublicationLookup): void => {
            if (settled) {
              return;
            }
            settled = true;
            active.removeEventListener("abort", cancelled);
            incoming?.destroy();
            outgoing?.destroy();
            resolve(result);
          };
          const failed = (): void => {
            finish({ status: signal.aborted ? "cancelled" : "unavailable" });
          };
          const cancelled = (): void => {
            failed();
          };
          active.addEventListener("abort", cancelled, { once: true });
          if (active.aborted) {
            failed();
            return;
          }
          const payload = JSON.stringify({
            query: OPERATION,
            operationName: "PlaybackPublications",
            variables: { ids: [titleId] },
          });
          try {
            outgoing = send(
              {
                protocol: "http:",
                hostname: "catalog",
                port: 3200,
                path: "/graphql",
                method: "POST",
                agent: false,
                signal: active,
                maxHeaderSize: 8192,
                headers: {
                  host: "catalog:3200",
                  origin: "http://playback:3300",
                  "x-aster-csrf": "1",
                  "x-aster-playback-credential": options.credential,
                  "content-type": "application/json",
                  accept: "application/json",
                  "content-length": Buffer.byteLength(payload),
                  connection: "close",
                },
              },
              (response) => {
                incoming = response;
                incoming.once("error", failed);
                incoming.once("aborted", failed);
                const contentType = response.headers["content-type"]?.split(";", 1)[0]?.trim();
                const declaredBytes = response.headers["content-length"];
                if (
                  settled ||
                  active.aborted ||
                  response.statusCode !== 200 ||
                  !["application/json", "application/graphql-response+json"].includes(
                    contentType ?? "",
                  ) ||
                  response.headers["content-encoding"] !== undefined ||
                  (declaredBytes !== undefined &&
                    (!/^[0-9]{1,5}$/u.test(declaredBytes) ||
                      Number(declaredBytes) > MAX_RESPONSE_BYTES))
                ) {
                  failed();
                  response.destroy();
                  return;
                }
                const chunks: Buffer[] = [];
                let bytes = 0;
                response.on("data", (chunk: Buffer) => {
                  bytes += chunk.length;
                  if (bytes > MAX_RESPONSE_BYTES) {
                    failed();
                    return;
                  }
                  chunks.push(chunk);
                });
                response.once("end", () => {
                  if (active.aborted || !response.complete) {
                    failed();
                    return;
                  }
                  try {
                    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                    if (
                      !onlyField(value, "data") ||
                      !onlyField(value["data"], "_playbackPublications")
                    ) {
                      failed();
                      return;
                    }
                    const publications: unknown = value["data"]["_playbackPublications"];
                    if (!Array.isArray(publications) || publications.length !== 1) {
                      failed();
                      return;
                    }
                    finish({ status: "completed", value: publications[0] as unknown });
                  } catch {
                    failed();
                  }
                });
              },
            );
            outgoing.once("error", failed);
            outgoing.end(payload);
          } catch {
            failed();
          }
        });
      } finally {
        inFlight -= 1;
      }
    },
  });
}
