import { request, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import type { CatalogSnapshotSource } from "../application/catalog-event-ports.js";
import type { ProjectionStoreResult } from "../application/projection-ports.js";
import { discoveryIdentifier } from "../domain/title-projection.js";

const OPERATION =
  "query DiscoverySnapshots($ids: [ID!]!) { _discoverySnapshots(ids: $ids) { titleId sourceVersion observedAt visibleUntil document { defaultLocale localizations { locale title synopsis } genres editorialLabels releaseYear publishedAt } } }";
const MAX_RESPONSE_BYTES = 65_536;
type CatalogRequest = (
  options: RequestOptions,
  response: (message: IncomingMessage) => void,
) => ClientRequest;

function only(value: unknown, field: string): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    Object.hasOwn(value, field)
  );
}

/** Fixed purpose-separated owner read; no redirects, retries or caller-selected transport. */
export function createCatalogSnapshotClient(
  options: Readonly<{ credential: string; request?: CatalogRequest }>,
): CatalogSnapshotSource {
  if (!/^[a-f0-9]{64}$/u.test(options.credential)) {
    throw new Error("Invalid Catalog Discovery credential.");
  }
  const send = options.request ?? request;
  let active = false;
  return Object.freeze({
    async current(
      titleId: string,
      correlationId: string,
      signal: AbortSignal,
    ): Promise<ProjectionStoreResult<unknown>> {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      if (!discoveryIdentifier(titleId) || !discoveryIdentifier(correlationId) || active) {
        return { status: "unavailable" };
      }
      active = true;
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(2000)]);
      try {
        return await new Promise<ProjectionStoreResult<unknown>>((resolve) => {
          let outgoing: ClientRequest | undefined;
          let incoming: IncomingMessage | undefined;
          let settled = false;
          const finish = (value: Awaited<ReturnType<CatalogSnapshotSource["current"]>>) => {
            if (settled) {
              return;
            }
            settled = true;
            bounded.removeEventListener("abort", fail);
            incoming?.destroy();
            outgoing?.destroy();
            resolve(value);
          };
          const fail = () => {
            finish({ status: signal.aborted ? "cancelled" : "unavailable" });
          };
          bounded.addEventListener("abort", fail, { once: true });
          if (bounded.aborted) {
            fail();
            return;
          }
          const payload = JSON.stringify({
            query: OPERATION,
            operationName: "DiscoverySnapshots",
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
                signal: bounded,
                maxHeaderSize: 8192,
                headers: {
                  host: "catalog:3200",
                  origin: "http://discovery:3500",
                  "x-aster-csrf": "1",
                  "x-aster-discovery-credential": options.credential,
                  "x-aster-correlation-id": correlationId,
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
                const type = response.headers["content-type"]?.split(";", 1)[0]?.trim();
                const declared = response.headers["content-length"];
                if (
                  settled ||
                  bounded.aborted ||
                  response.statusCode !== 200 ||
                  !["application/json", "application/graphql-response+json"].includes(type ?? "") ||
                  response.headers["content-encoding"] !== undefined ||
                  response.headers["set-cookie"] !== undefined ||
                  (declared !== undefined &&
                    (!/^[0-9]{1,5}$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES))
                ) {
                  fail();
                  response.destroy();
                  return;
                }
                const chunks: Buffer[] = [];
                let received = 0;
                response.on("data", (chunk: Buffer) => {
                  received += chunk.length;
                  if (received > MAX_RESPONSE_BYTES) {
                    fail();
                    return;
                  }
                  chunks.push(chunk);
                });
                response.once("end", () => {
                  if (bounded.aborted || !response.complete) {
                    fail();
                    return;
                  }
                  try {
                    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                    if (!only(body, "data") || !only(body["data"], "_discoverySnapshots")) {
                      fail();
                      return;
                    }
                    const snapshots: unknown = body["data"]["_discoverySnapshots"];
                    const entry = Array.isArray(snapshots)
                      ? Object.getOwnPropertyDescriptor(snapshots, "0")
                      : undefined;
                    if (
                      !Array.isArray(snapshots) ||
                      snapshots.length !== 1 ||
                      Reflect.ownKeys(snapshots).length !== 2 ||
                      !entry ||
                      !("value" in entry)
                    ) {
                      fail();
                      return;
                    }
                    finish({ status: "completed", value: entry.value as unknown });
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
        active = false;
      }
    },
  });
}
