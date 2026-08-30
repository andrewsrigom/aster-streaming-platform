import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import { createCatalogSnapshotClient } from "../src/infrastructure/catalog-snapshot-client.js";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const credential = randomBytes(32).toString("hex");
const snapshot = {
  titleId: id(1),
  sourceVersion: 7,
  observedAt: 1_700_000_000,
  visibleUntil: 1_700_000_300,
  document: {
    defaultLocale: "en",
    localizations: [{ locale: "en", title: "Signal", synopsis: "A generated journey." }],
    genres: ["animation"],
    editorialLabels: ["featured"],
    releaseYear: 2026,
    publishedAt: 1_699_999_999,
  },
};

async function fixture(respond: (incoming: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(respond);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const client = createCatalogSnapshotClient({
    credential,
    random: () => 0,
    request: (options, callback) =>
      request({ ...options, hostname: "127.0.0.1", port: address.port }, callback),
  });
  return {
    client,
    async close() {
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

test("Catalog snapshot client sends one fixed purpose-separated read and preserves owner absence", async () => {
  let calls = 0;
  const f = await fixture((incoming, response) => {
    calls++;
    assert.equal(incoming.method, "POST");
    assert.equal(incoming.url, "/graphql");
    assert.equal(incoming.headers["host"], "catalog:3200");
    assert.equal(incoming.headers["origin"], "http://discovery:3500");
    assert.equal(incoming.headers["x-aster-discovery-credential"], credential);
    assert.equal(incoming.headers["x-aster-correlation-id"], id(3));
    assert.equal(incoming.headers["x-aster-router-credential"], undefined);
    assert.equal(incoming.headers["cookie"], undefined);
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      assert.deepEqual(body, {
        operationName: "DiscoverySnapshots",
        variables: { ids: [id(1)] },
        query:
          "query DiscoverySnapshots($ids: [ID!]!) { _discoverySnapshots(ids: $ids) { titleId sourceVersion observedAt visibleUntil document { defaultLocale localizations { locale title synopsis } genres editorialLabels releaseYear publishedAt } } }",
      });
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({ data: { _discoverySnapshots: [calls === 1 ? snapshot : null] } }),
      );
    });
  });
  try {
    assert.deepEqual(await f.client.current(id(1), id(3), AbortSignal.timeout(3000)), {
      status: "completed",
      value: snapshot,
    });
    assert.deepEqual(await f.client.current(id(1), id(3), AbortSignal.timeout(3000)), {
      status: "completed",
      value: null,
    });
    assert.equal(calls, 2);
  } finally {
    await f.close();
  }
});

test("Catalog snapshot client scans exact bounded and strictly ordered export pages", async () => {
  let calls = 0;
  const f = await fixture((incoming, response) => {
    calls++;
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      assert.deepEqual(body, {
        operationName: "DiscoveryExport",
        variables: { after: calls === 1 ? null : id(2) },
        query:
          "query DiscoveryExport($after: ID) { _discoveryExport(after: $after) { snapshots { titleId sourceVersion observedAt visibleUntil document { defaultLocale localizations { locale title synopsis } genres editorialLabels releaseYear publishedAt } } endCursor hasNextPage } }",
      });
      const values = calls === 1 ? [snapshot, { ...snapshot, titleId: id(2) }] : [];
      response.setHeader("content-type", "application/graphql-response+json");
      response.end(
        JSON.stringify({
          data: {
            _discoveryExport: {
              snapshots: values,
              endCursor: values.at(-1)?.titleId ?? null,
              hasNextPage: calls === 1,
            },
          },
        }),
      );
    });
  });
  try {
    assert.deepEqual(await f.client.exportPage(null, id(3), AbortSignal.timeout(3000)), {
      status: "completed",
      value: {
        snapshots: [snapshot, { ...snapshot, titleId: id(2) }],
        endCursor: id(2),
        hasNextPage: true,
      },
    });
    assert.deepEqual(await f.client.exportPage(id(2), id(3), AbortSignal.timeout(3000)), {
      status: "completed",
      value: { snapshots: [], endCursor: null, hasNextPage: false },
    });
    assert.equal(calls, 2);
  } finally {
    await f.close();
  }
});

test("Catalog snapshot export fails closed on malformed pagination", async () => {
  const invalidPages = [
    { snapshots: [snapshot], endCursor: snapshot.titleId, hasNextPage: true },
    { snapshots: [snapshot, snapshot], endCursor: snapshot.titleId, hasNextPage: false },
    {
      snapshots: [{ ...snapshot, titleId: id(2) }, snapshot],
      endCursor: snapshot.titleId,
      hasNextPage: false,
    },
    { snapshots: [snapshot], endCursor: id(2), hasNextPage: false },
    { snapshots: [snapshot], endCursor: snapshot.titleId, hasNextPage: false, extra: true },
  ];
  for (const page of invalidPages) {
    const f = await fixture((_incoming, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { _discoveryExport: page } }));
    });
    try {
      assert.deepEqual(await f.client.exportPage(null, id(3), AbortSignal.timeout(3000)), {
        status: "unavailable",
      });
    } finally {
      await f.close();
    }
  }
});

test("Catalog snapshot client retries one transient owner status inside its deadline", async () => {
  let calls = 0;
  const f = await fixture((_incoming, response) => {
    calls++;
    response.setHeader("content-type", "application/json");
    if (calls === 1) {
      response.statusCode = 503;
      response.end('{"errors":[{"message":"temporary"}]}');
      return;
    }
    response.end(JSON.stringify({ data: { _discoverySnapshots: [snapshot] } }));
  });
  try {
    assert.deepEqual(await f.client.current(id(1), id(3), AbortSignal.timeout(3000)), {
      status: "completed",
      value: snapshot,
    });
    assert.equal(calls, 2);
  } finally {
    await f.close();
  }
});

test("Catalog snapshot client retries one selected connection reset inside its deadline", async () => {
  let calls = 0;
  const f = await fixture((incoming, response) => {
    calls++;
    if (calls === 1) {
      incoming.socket.destroy();
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: { _discoverySnapshots: [null] } }));
  });
  try {
    assert.deepEqual(await f.client.current(id(1), id(3), AbortSignal.timeout(3000)), {
      status: "completed",
      value: null,
    });
    assert.equal(calls, 2);
  } finally {
    await f.close();
  }
});

test("Catalog snapshot client fails closed on permanent transport and envelope violations without retry", async () => {
  for (const scenario of [
    "permanent-status",
    "redirect",
    "declared",
    "stream",
    "compressed",
    "cookie",
    "type",
    "malformed",
    "errors",
    "empty",
    "many",
  ] as const) {
    let calls = 0;
    const f = await fixture((_incoming, response) => {
      calls++;
      response.setHeader("content-type", scenario === "type" ? "text/html" : "application/json");
      if (scenario === "permanent-status") {
        response.statusCode = 500;
      }
      if (scenario === "redirect") {
        response.statusCode = 302;
      }
      if (scenario === "declared") {
        response.setHeader("content-length", "65537");
      }
      if (scenario === "compressed") {
        response.setHeader("content-encoding", "gzip");
      }
      if (scenario === "cookie") {
        response.setHeader("set-cookie", "private=value");
      }
      if (scenario === "stream") {
        response.write(" ".repeat(65_537));
        response.end();
        return;
      }
      const values = scenario === "empty" ? [] : scenario === "many" ? [null, null] : [null];
      response.end(
        scenario === "malformed"
          ? "{"
          : JSON.stringify({
              data: { _discoverySnapshots: values },
              ...(scenario === "errors" ? { errors: [{ message: "private" }] } : {}),
            }),
      );
    });
    try {
      assert.deepEqual(
        await f.client.current(id(1), id(3), AbortSignal.timeout(3000)),
        { status: "unavailable" },
        scenario,
      );
      assert.equal(calls, 1, scenario);
    } finally {
      await f.close();
    }
  }
});

test("Catalog snapshot client rejects invalid, concurrent and cancelled work without a queue", async () => {
  let calls = 0;
  const entered = Promise.withResolvers<undefined>();
  const f = await fixture(() => {
    calls++;
    entered.resolve(undefined);
  });
  const controller = new AbortController();
  try {
    assert.deepEqual(await f.client.current("bad", id(3), controller.signal), {
      status: "unavailable",
    });
    assert.deepEqual(await f.client.current(id(1), "bad", controller.signal), {
      status: "unavailable",
    });
    assert.deepEqual(await f.client.current(id(1), id(3), AbortSignal.abort()), {
      status: "cancelled",
    });
    const pending = f.client.current(id(1), id(3), controller.signal);
    await entered.promise;
    assert.deepEqual(await f.client.current(id(1), id(3), controller.signal), {
      status: "unavailable",
    });
    controller.abort();
    assert.deepEqual(await pending, { status: "cancelled" });
    assert.equal(calls, 1);
  } finally {
    controller.abort();
    await f.close();
  }
});
