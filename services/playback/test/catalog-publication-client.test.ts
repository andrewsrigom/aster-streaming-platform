import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import { createCatalogPublicationClient } from "../src/infrastructure/catalog-publication-client.js";

const id = "00000000-0000-4000-8000-000000000001";
const credential = randomBytes(32).toString("hex");
async function fixture(respond: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(respond);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const client = createCatalogPublicationClient({
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

test("owner HTTP client sends the fixed bounded operation and separate credential, preserving null or publication", async () => {
  let calls = 0;
  const traceparent = `00-${"a".repeat(32)}-${"b".repeat(16)}-01`;
  const publication = {
    titleId: id,
    publicationId: id,
    titleVersion: 1,
    manifestUrl: "https://example.invalid/master.m3u8",
    checkedAt: 1,
    validUntil: null,
  };
  const f = await fixture((incoming, response) => {
    calls++;
    assert.equal(incoming.method, "POST");
    assert.equal(incoming.url, "/graphql");
    assert.equal(incoming.headers["host"], "catalog:3200");
    assert.equal(incoming.headers["origin"], "http://playback:3300");
    assert.equal(incoming.headers["x-aster-playback-credential"], credential);
    assert.equal(incoming.headers["x-aster-router-credential"], undefined);
    assert.equal(incoming.headers["cookie"], undefined);
    assert.equal(incoming.headers["traceparent"], calls === 1 ? traceparent : undefined);
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    incoming.on("end", () => {
      assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString("utf8")), {
        operationName: "PlaybackPublications",
        variables: { ids: [id] },
        query:
          "query PlaybackPublications($ids: [ID!]!) { _playbackPublications(ids: $ids) { titleId publicationId titleVersion manifestUrl checkedAt validUntil } }",
      });
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({ data: { _playbackPublications: [calls === 1 ? publication : null] } }),
      );
    });
  });
  try {
    assert.deepEqual(
      await f.client.currentPublication(id, AbortSignal.timeout(2000), traceparent),
      {
        status: "completed",
        value: publication,
      },
    );
    assert.deepEqual(await f.client.currentPublication(id, AbortSignal.timeout(2000)), {
      status: "completed",
      value: null,
    });
    assert.equal(calls, 2);
  } finally {
    await f.close();
  }
});

test("owner client retries one transient status inside its deadline", async () => {
  let calls = 0;
  const f = await fixture((_incoming, response) => {
    calls++;
    response.setHeader("content-type", "application/json");
    if (calls === 1) {
      response.statusCode = 503;
      response.end('{"errors":[{"message":"temporary"}]}');
      return;
    }
    response.end('{"data":{"_playbackPublications":[null]}}');
  });
  try {
    assert.deepEqual(await f.client.currentPublication(id, AbortSignal.timeout(2000)), {
      status: "completed",
      value: null,
    });
    assert.equal(calls, 2);
  } finally {
    await f.close();
  }
});

test("owner client retries one selected connection reset inside its deadline", async () => {
  let calls = 0;
  const f = await fixture((incoming, response) => {
    calls++;
    if (calls === 1) {
      incoming.socket.destroy();
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end('{"data":{"_playbackPublications":[null]}}');
  });
  try {
    assert.deepEqual(await f.client.currentPublication(id, AbortSignal.timeout(2000)), {
      status: "completed",
      value: null,
    });
    assert.equal(calls, 2);
  } finally {
    await f.close();
  }
});

test("owner client fails closed on permanent HTTP, redirects, oversized/compressed bodies and malformed envelopes without retry", async () => {
  for (const scenario of [
    "http-permanent",
    "redirect",
    "declared-size",
    "stream-size",
    "compressed",
    "html",
    "malformed",
    "errors",
    "empty",
    "many",
    "extra",
  ] as const) {
    let calls = 0;
    const f = await fixture((_incoming, response) => {
      calls++;
      response.setHeader("content-type", scenario === "html" ? "text/html" : "application/json");
      if (scenario === "http-permanent") {
        response.statusCode = 500;
      }
      if (scenario === "redirect") {
        response.statusCode = 302;
        response.setHeader("location", "http://private.invalid");
      }
      if (scenario === "declared-size") {
        response.setHeader("content-length", "8193");
      }
      if (scenario === "compressed") {
        response.setHeader("content-encoding", "gzip");
      }
      if (scenario === "stream-size") {
        response.write(" ".repeat(8193));
        response.end();
        return;
      }
      const values = scenario === "empty" ? [] : scenario === "many" ? [null, null] : [null];
      response.end(
        scenario === "malformed"
          ? "{"
          : JSON.stringify({
              data: { _playbackPublications: values },
              ...(scenario === "errors" ? { errors: [{ message: "private failure" }] } : {}),
              ...(scenario === "extra" ? { extra: "unexpected" } : {}),
            }),
      );
    });
    try {
      assert.deepEqual(
        await f.client.currentPublication(id, AbortSignal.timeout(2000)),
        { status: "unavailable" },
        scenario,
      );
      assert.equal(calls, 1, scenario);
    } finally {
      await f.close();
    }
  }
});

test("owner client bounds live requests, cancels sockets and does not send invalid or pre-cancelled reads", async () => {
  let calls = 0;
  const reached = Promise.withResolvers<undefined>();
  const f = await fixture(() => {
    calls++;
    if (calls === 4) {
      reached.resolve(undefined);
    }
  });
  const controller = new AbortController();
  try {
    assert.deepEqual(await f.client.currentPublication("bad", controller.signal), {
      status: "unavailable",
    });
    for (const trace of [
      "invalid",
      `00-${"0".repeat(32)}-${"b".repeat(16)}-01`,
      `00-${"a".repeat(32)}-${"0".repeat(16)}-01`,
    ]) {
      assert.deepEqual(await f.client.currentPublication(id, controller.signal, trace), {
        status: "unavailable",
      });
    }
    assert.deepEqual(await f.client.currentPublication(id, AbortSignal.abort()), {
      status: "cancelled",
    });
    const pending = Array.from({ length: 4 }, () =>
      f.client.currentPublication(id, controller.signal),
    );
    assert.deepEqual(await f.client.currentPublication(id, controller.signal), {
      status: "unavailable",
    });
    await reached.promise;
    controller.abort();
    assert.deepEqual(
      await Promise.all(pending),
      Array.from({ length: 4 }, () => ({ status: "cancelled" })),
    );
    assert.equal(calls, 4);
  } finally {
    controller.abort();
    await f.close();
  }
});

test(
  "owner client's own deadline closes an unresponsive dependency and resets admission",
  { timeout: 5000 },
  async () => {
    let calls = 0;
    const f = await fixture((_incoming, response) => {
      calls++;
      if (calls > 1) {
        response.setHeader("content-type", "application/json");
        response.end('{"data":{"_playbackPublications":[null]}}');
      }
    });
    try {
      assert.deepEqual(await f.client.currentPublication(id, new AbortController().signal), {
        status: "unavailable",
      });
      assert.deepEqual(await f.client.currentPublication(id, AbortSignal.timeout(2000)), {
        status: "completed",
        value: null,
      });
    } finally {
      await f.close();
    }
  },
);
