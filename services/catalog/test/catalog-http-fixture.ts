import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createExpressHttpAdapter } from "@aster/http-express";
import type { CatalogPublicQueries } from "../src/application/public-queries.js";
import {
  createCatalogSubgraph,
  type CatalogOperationTrace,
} from "../src/transport/catalog-subgraph.js";

interface CatalogHttpResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  readonly json: {
    data?: Record<string, unknown>;
    errors?: { message: string; extensions: { code: string; correlationId?: string } }[];
  };
}

export async function catalogHttpFixture(
  queries: CatalogPublicQueries,
  monotonicNow?: () => number,
) {
  const adapter = createExpressHttpAdapter({ bodyLimitBytes: 32768 });
  const http = createServer({ maxHeaderSize: 16384 }, adapter.requestListener);
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  assert.ok(address && typeof address === "object");
  const origin = "http://127.0.0.1:" + String(address.port);
  const traces: CatalogOperationTrace[] = [];
  const diagnostics: string[] = [];
  const graph = await createCatalogSubgraph({
    queries,
    ...(monotonicNow ? { monotonicNow } : {}),
    onOperation: (trace) => {
      traces.push(trace);
    },
    onDiagnostic: (code) => {
      diagnostics.push(code);
    },
  });
  adapter.mountGraphql(graph.middleware);
  return {
    graph,
    origin,
    traces,
    diagnostics,
    async send(body: unknown, headers: Record<string, string> = {}): Promise<CatalogHttpResponse> {
      const response = await fetch(origin + "/graphql", {
        method: "POST",
        headers: { "content-type": "application/json", connection: "close", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      const text = await response.text();
      const json = JSON.parse(text) as {
        data?: Record<string, unknown>;
        errors?: { message: string; extensions: { code: string; correlationId?: string } }[];
      };
      return { status: response.status, headers: response.headers, text, json };
    },
    async close() {
      await graph.stop();
      await new Promise<void>((resolve, reject) => {
        http.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        http.closeAllConnections();
      });
    },
  };
}
