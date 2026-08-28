import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, request } from "node:http";
import { createExpressHttpAdapter, createLocalRouterTrust } from "@aster/http-express";
import {
  createPlaybackSessions,
  type PlaybackSessions,
} from "../src/application/create-session.js";
import type { PlaybackSession } from "../src/domain/session.js";
import type { PublicationLookup } from "../src/application/session-ports.js";
import {
  createPlaybackSubgraph,
  type PlaybackOperationTrace,
  type PlaybackSubgraphOptions,
} from "../src/transport/playback-subgraph.js";

export const testTitleId = "00000000-0000-4000-8000-000000000001";
export const playbackDocument =
  "mutation StartPlayback($titleId: ID!) { createPlaybackSession(titleId: $titleId) { code correlationId session { id titleId manifestUrl expiresAt } } }";
export const playbackBody = {
  query: playbackDocument,
  operationName: "StartPlayback",
  variables: { titleId: testTitleId },
};
export interface PlaybackHttpResult {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly text: string;
  readonly json: {
    data?: {
      _engagementSession?: Record<string, unknown>;
      createPlaybackSession?: {
        code: string;
        correlationId: string;
        session: { id: string; titleId: string; manifestUrl: string; expiresAt: number } | null;
      };
    };
    errors?: readonly { message: string; extensions: { code: string } }[];
  };
}

export async function playbackHttpFixture(
  override?: PlaybackSessions,
  engagement?: PlaybackSubgraphOptions["engagement"],
) {
  const key = randomBytes(32).toString("hex");
  const adapter = createExpressHttpAdapter({ bodyLimitBytes: 16384 });
  const server = createServer({ maxHeaderSize: 16384 }, adapter.requestListener);
  const state = {
    time: 1_787_900_000,
    monotonic: 0,
    reads: 0,
    writes: [] as PlaybackSession[],
    traceparents: [] as (string | undefined)[],
    lookup: undefined as ((signal: AbortSignal) => Promise<PublicationLookup>) | undefined,
  };
  const publication = {
    titleId: testTitleId,
    publicationId: randomUUID(),
    titleVersion: 1,
    manifestUrl: "https://example.invalid/master.m3u8",
    checkedAt: state.time,
    validUntil: null,
  };
  const sessions =
    override ??
    createPlaybackSessions({
      now: () => state.time,
      nextId: randomUUID,
      allowLocalMedia: false,
      catalog: {
        currentPublication: (_titleId, signal, traceparent) => {
          state.reads++;
          state.traceparents.push(traceparent);
          return state.lookup
            ? state.lookup(signal)
            : Promise.resolve({ status: "completed", value: publication });
        },
      },
      sessions: {
        create: (value) => {
          state.writes.push(value);
          return Promise.resolve({ status: "completed" });
        },
      },
    });
  const traces: PlaybackOperationTrace[] = [];
  const graph = await createPlaybackSubgraph({
    sessions,
    ...(engagement ? { engagement } : {}),
    routerTrust: createLocalRouterTrust("playback", key),
    monotonicNow: () => state.monotonic,
    onOperation: (value) => {
      traces.push(value);
    },
  });
  adapter.mountGraphql(graph.middleware);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const headers = {
    host: "playback:3300",
    origin: "http://127.0.0.1:4000",
    "x-aster-csrf": "1",
    "x-aster-router-credential": key,
  };
  return {
    state,
    publication,
    traces,
    headers,
    key,
    graph,
    async send(
      body: unknown = playbackBody,
      suppliedHeaders: Readonly<Record<string, string>> = headers,
    ): Promise<PlaybackHttpResult> {
      return new Promise((resolve, reject) => {
        const outgoing = request(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/graphql",
            method: "POST",
            signal: AbortSignal.timeout(5000),
            headers: {
              "content-type": "application/json",
              connection: "close",
              ...suppliedHeaders,
            },
          },
          (incoming) => {
            const chunks: Buffer[] = [];
            incoming.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });
            incoming.once("error", reject);
            incoming.once("end", () => {
              try {
                const text = Buffer.concat(chunks).toString("utf8");
                resolve({
                  status: incoming.statusCode ?? 500,
                  headers: incoming.headers,
                  text,
                  json: JSON.parse(text) as PlaybackHttpResult["json"],
                });
              } catch (error) {
                reject(error instanceof Error ? error : new Error("Invalid fixture response."));
              }
            });
          },
        );
        outgoing.once("error", reject);
        outgoing.end(JSON.stringify(body));
      });
    },
    async close() {
      await graph.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        server.closeAllConnections();
      });
    },
  };
}
