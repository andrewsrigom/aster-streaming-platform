import { request, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import type { CatalogSnapshotSource } from "../application/catalog-event-ports.js";
import type {
  CatalogSnapshotExportPage,
  CatalogSnapshotExportSource,
} from "../application/rebuild-ports.js";
import type { ProjectionStoreResult } from "../application/projection-ports.js";
import { discoveryIdentifier } from "../domain/title-projection.js";

const SNAPSHOTS_OPERATION =
  "query DiscoverySnapshots($ids: [ID!]!) { _discoverySnapshots(ids: $ids) { titleId sourceVersion observedAt visibleUntil document { defaultLocale localizations { locale title synopsis } genres editorialLabels releaseYear publishedAt } } }";
const EXPORT_OPERATION =
  "query DiscoveryExport($after: ID) { _discoveryExport(after: $after) { snapshots { titleId sourceVersion observedAt visibleUntil document { defaultLocale localizations { locale title synopsis } genres editorialLabels releaseYear publishedAt } } endCursor hasNextPage } }";
const MAX_RESPONSE_BYTES = 65_536;
type CatalogRequest = (
  options: RequestOptions,
  response: (message: IncomingMessage) => void,
) => ClientRequest;
type ParseResult<T> = Readonly<{ valid: true; value: T }> | Readonly<{ valid: false }>;

function exact(value: unknown, fields: readonly string[]): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.length &&
    keys.every((key) => typeof key === "string" && fields.includes(key))
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseCurrent(body: unknown): ParseResult<unknown> {
  const root = exact(body, ["data"]);
  const data = root && exact(root["data"], ["_discoverySnapshots"]);
  const snapshots = data?.["_discoverySnapshots"];
  const entry = Array.isArray(snapshots)
    ? Object.getOwnPropertyDescriptor(snapshots, "0")
    : undefined;
  return Array.isArray(snapshots) &&
    snapshots.length === 1 &&
    Reflect.ownKeys(snapshots).length === 2 &&
    entry &&
    "value" in entry
    ? { valid: true, value: entry.value as unknown }
    : { valid: false };
}

function parseExport(body: unknown, after: string | null): ParseResult<CatalogSnapshotExportPage> {
  const root = exact(body, ["data"]);
  const data = root && exact(root["data"], ["_discoveryExport"]);
  const page = data && exact(data["_discoveryExport"], ["snapshots", "endCursor", "hasNextPage"]);
  const snapshots = page?.["snapshots"];
  const endCursor = page?.["endCursor"];
  const hasNextPage = page?.["hasNextPage"];
  if (
    !Array.isArray(snapshots) ||
    snapshots.length > 2 ||
    Reflect.ownKeys(snapshots).length !== snapshots.length + 1 ||
    typeof hasNextPage !== "boolean" ||
    (hasNextPage && snapshots.length !== 2)
  ) {
    return { valid: false };
  }
  const values: unknown[] = [];
  let previous = after;
  for (let index = 0; index < snapshots.length; index++) {
    const entry = Object.getOwnPropertyDescriptor(snapshots, String(index));
    const snapshot = entry && "value" in entry ? (entry.value as unknown) : undefined;
    const title = exact(snapshot, [
      "titleId",
      "sourceVersion",
      "observedAt",
      "visibleUntil",
      "document",
    ]);
    const titleId = title?.["titleId"];
    if (!discoveryIdentifier(titleId) || (previous !== null && titleId <= previous)) {
      return { valid: false };
    }
    previous = titleId;
    values.push(snapshot);
  }
  const expectedCursor = values.length === 0 ? null : previous;
  if ((endCursor !== null && !discoveryIdentifier(endCursor)) || endCursor !== expectedCursor) {
    return { valid: false };
  }
  return {
    valid: true,
    value: Object.freeze({
      snapshots: Object.freeze(values),
      endCursor,
      hasNextPage,
    }),
  };
}

/** Fixed purpose-separated owner reads; no redirects, retries or caller-selected transport. */
export function createCatalogSnapshotClient(
  options: Readonly<{ credential: string; request?: CatalogRequest }>,
): CatalogSnapshotSource & CatalogSnapshotExportSource {
  if (!/^[a-f0-9]{64}$/u.test(options.credential)) {
    throw new Error("Invalid Catalog Discovery credential.");
  }
  const send = options.request ?? request;
  let active = false;

  async function execute<T>(
    operationName: "DiscoverySnapshots" | "DiscoveryExport",
    query: string,
    variables: Readonly<Record<string, unknown>>,
    correlationId: string,
    signal: AbortSignal,
    parseBody: (body: unknown) => ParseResult<T>,
  ): Promise<ProjectionStoreResult<T>> {
    if (signal.aborted) {
      return { status: "cancelled" };
    }
    if (!discoveryIdentifier(correlationId) || active) {
      return { status: "unavailable" };
    }
    active = true;
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(2000)]);
    try {
      return await new Promise<ProjectionStoreResult<T>>((resolve) => {
        let outgoing: ClientRequest | undefined;
        let incoming: IncomingMessage | undefined;
        let settled = false;
        const finish = (value: ProjectionStoreResult<T>) => {
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
        const payload = JSON.stringify({ query, operationName, variables });
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
                  const parsed = parseBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
                  if (parsed.valid) {
                    finish({ status: "completed", value: parsed.value });
                  } else {
                    fail();
                  }
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
  }

  return Object.freeze({
    current(titleId: string, correlationId: string, signal: AbortSignal) {
      return discoveryIdentifier(titleId)
        ? execute(
            "DiscoverySnapshots",
            SNAPSHOTS_OPERATION,
            { ids: [titleId] },
            correlationId,
            signal,
            parseCurrent,
          )
        : Promise.resolve({ status: "unavailable" } as const);
    },
    exportPage(after: string | null, correlationId: string, signal: AbortSignal) {
      return after === null || discoveryIdentifier(after)
        ? execute("DiscoveryExport", EXPORT_OPERATION, { after }, correlationId, signal, (body) =>
            parseExport(body, after),
          )
        : Promise.resolve({ status: "unavailable" } as const);
    },
  });
}
