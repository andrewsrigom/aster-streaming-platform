import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import { createAsterCircuitBreaker } from "@aster/runtime";
import type { AsterCircuitBreakerMetricInput } from "@aster/telemetry";
import { createCatalogPublicationClient } from "../src/infrastructure/catalog-publication-client.js";

const id = "00000000-0000-4000-8000-000000000001";
const credential = randomBytes(32).toString("hex");
type FixtureOptions = Partial<
  Pick<
    Parameters<typeof createCatalogPublicationClient>[0],
    "allowLocalMedia" | "circuitBreaker" | "now" | "telemetry"
  >
>;

async function fixture(
  respond: (request: IncomingMessage, response: ServerResponse) => void,
  options: FixtureOptions = {},
) {
  const server = createServer(respond);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const client = createCatalogPublicationClient({
    credential,
    now: () => 1,
    allowLocalMedia: false,
    random: () => 0,
    request: (options, callback) =>
      request({ ...options, hostname: "127.0.0.1", port: address.port }, callback),
    ...options,
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

test("owner client stops calls while open and admits one successful recovery probe", async () => {
  let current = 0;
  let calls = 0;
  let probeResponse: ServerResponse | undefined;
  const probeEntered = Promise.withResolvers<undefined>();
  const breaker = createAsterCircuitBreaker({
    samplingWindowMs: 1_000,
    minimumThroughput: 2,
    failureRateThresholdPercentage: 100,
    openDurationMs: 100,
    now: () => current,
  });
  const f = await fixture(
    (_incoming, response) => {
      calls++;
      response.setHeader("content-type", "application/json");
      if (calls <= 2) {
        response.statusCode = 500;
        response.end('{"errors":[{"message":"unavailable"}]}');
        return;
      }
      if (calls === 3) {
        probeResponse = response;
        probeEntered.resolve(undefined);
        return;
      }
      response.end('{"data":{"_playbackPublications":[null]}}');
    },
    { circuitBreaker: breaker },
  );
  try {
    for (let index = 0; index < 2; index++) {
      assert.deepEqual(await f.client.currentPublication(id, AbortSignal.timeout(2_000)), {
        status: "unavailable",
      });
    }
    assert.equal(breaker.snapshot().state, "open");
    assert.deepEqual(await f.client.currentPublication(id, AbortSignal.timeout(2_000)), {
      status: "unavailable",
    });
    assert.equal(calls, 2);

    current = 100;
    const probe = f.client.currentPublication(id, AbortSignal.timeout(2_000));
    await probeEntered.promise;
    assert.equal(breaker.snapshot().state, "half_open");
    assert.deepEqual(await f.client.currentPublication(id, AbortSignal.timeout(2_000)), {
      status: "unavailable",
    });
    assert.equal(calls, 3);
    assert.ok(probeResponse);
    probeResponse.end('{"data":{"_playbackPublications":[null]}}');
    assert.deepEqual(await probe, { status: "completed", value: null });
    assert.equal(breaker.snapshot().state, "closed");
    assert.deepEqual(await f.client.currentPublication(id, AbortSignal.timeout(2_000)), {
      status: "completed",
      value: null,
    });
    assert.equal(calls, 4);
  } finally {
    await f.close();
  }
});

test("invalid owner publications count as failures and open before another HTTP call", async () => {
  let calls = 0;
  const breaker = createAsterCircuitBreaker({
    samplingWindowMs: 1_000,
    minimumThroughput: 3,
    failureRateThresholdPercentage: 100,
    openDurationMs: 100,
    now: () => 0,
  });
  const publications = [
    {
      titleId: id.replace(/1$/u, "2"),
      publicationId: id,
      titleVersion: 1,
      manifestUrl: "https://example.invalid/master.m3u8",
      checkedAt: 4,
      validUntil: null,
    },
    {
      titleId: id,
      publicationId: id,
      titleVersion: 1,
      manifestUrl: "https://example.invalid/master.m3u8",
      checkedAt: 1,
      validUntil: null,
    },
    {
      titleId: id,
      publicationId: id,
      titleVersion: 1,
      manifestUrl: "javascript:invalid",
      checkedAt: 4,
      validUntil: null,
    },
  ];
  const f = await fixture(
    (_incoming, response) => {
      const publication = publications[calls];
      calls++;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { _playbackPublications: [publication] } }));
    },
    { circuitBreaker: breaker, now: () => 4 },
  );
  try {
    for (let index = 0; index < publications.length; index++) {
      assert.deepEqual(await f.client.currentPublication(id, AbortSignal.timeout(2_000)), {
        status: "unavailable",
      });
    }
    assert.equal(breaker.snapshot().state, "open");
    assert.deepEqual(await f.client.currentPublication(id, AbortSignal.timeout(2_000)), {
      status: "unavailable",
    });
    assert.equal(calls, 3);
  } finally {
    await f.close();
  }
});

test("default publication breaker emits finite telemetry and suppresses the fifth failed call", async () => {
  let calls = 0;
  const events: AsterCircuitBreakerMetricInput[] = [];
  const f = await fixture(
    (_incoming, response) => {
      calls++;
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end('{"errors":[{"message":"unavailable"}]}');
    },
    {
      telemetry: {
        startDependencyOperation: () => ({
          status: "rejected",
          reason: "telemetry_closed",
        }),
        recordCircuitBreaker: (input) => {
          events.push(input);
          return { status: "recorded" };
        },
      },
    },
  );
  try {
    for (let index = 0; index < 5; index++) {
      assert.deepEqual(await f.client.currentPublication(id, AbortSignal.timeout(2_000)), {
        status: "unavailable",
      });
    }
    assert.equal(calls, 4);
    assert.ok(events.some((event) => event.event === "opened" && event.state === "open"));
    assert.ok(events.some((event) => event.event === "rejected_open"));
    assert.ok(events.every((event) => event.operation === "playback_publication"));
  } finally {
    await f.close();
  }
});
