import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import { createAsterTelemetry } from "@aster/telemetry";
import { createProgressOwnerClients } from "../src/infrastructure/owner-clients.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const credentials = {
  identityCredential: "a".repeat(64),
  playbackCredential: "b".repeat(64),
  catalogCredential: "e".repeat(64),
};
const token = "synthetic.viewer.signature";
const context = (signal = new AbortController().signal) => ({
  signal,
  correlationId: id(1),
  traceparent: `00-${"c".repeat(32)}-${"d".repeat(16)}-01`,
});
const identity = {
  code: "COMPLETED",
  accountId: id(2),
  profileId: id(3),
  checkedAt: 100,
  expiresAt: 1000,
};
const playback = {
  code: "COMPLETED",
  sessionId: id(4),
  titleId: id(5),
  checkedAt: 100,
  createdAt: 90,
  expiresAt: 1000,
};
const catalog = {
  code: "COMPLETED",
  checkedAt: 100,
  expiresAt: 102,
  titles: [
    { titleId: id(5), visible: true },
    { titleId: id(6), visible: false },
  ],
};
async function fixture(
  respond: (incoming: IncomingMessage, response: ServerResponse) => void,
  options: Partial<Pick<Parameters<typeof createProgressOwnerClients>[0], "telemetry">> = {},
) {
  const server = createServer(respond);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  let requests = 0;
  const clients = createProgressOwnerClients({
    ...credentials,
    request: (options, callback) => {
      requests++;
      assert.ok(
        options.hostname === "identity" ||
          options.hostname === "playback" ||
          options.hostname === "catalog",
      );
      assert.equal(
        options.port,
        options.hostname === "identity" ? 3100 : options.hostname === "catalog" ? 3200 : 3300,
      );
      return request({ ...options, hostname: "127.0.0.1", port: address.port }, callback);
    },
    ...options,
  });
  return {
    clients,
    requests: () => requests,
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

test("owner reads propagate a child dependency context from the active server span", async () => {
  const telemetry = createAsterTelemetry({
    serviceName: "engagement-owner-client-test",
    serviceVersion: "1.0.0",
    environment: "test",
    maxActiveSpans: 4,
  });
  let propagatedTraceparent: string | undefined;
  const f = await fixture(
    (incoming, response) => {
      const header = incoming.headers["traceparent"];
      propagatedTraceparent = Array.isArray(header) ? header[0] : header;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { _engagementProfile: identity } }));
    },
    { telemetry },
  );
  const server = telemetry.startHttpRequest({
    method: "POST",
    route: "/graphql",
    traceparent: context().traceparent,
  });
  assert.equal(server.status, "started");
  assert.ok(server.observation.run);
  assert.ok(server.observation.traceContext);
  const serverContext = server.observation.traceContext();
  try {
    const operation = server.observation.run(() =>
      f.clients.identity.authorizeProfile(token, id(3), context()),
    );
    assert.equal((await operation).status, "completed");
    assert.match(propagatedTraceparent ?? "", /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/u);
    assert.notEqual(propagatedTraceparent, serverContext.traceparent);
    assert.equal(propagatedTraceparent?.slice(3, 35), serverContext.traceId);
    server.observation.complete({ outcome: "success", statusCode: 200 });

    const traces = await telemetry.collectTraces();
    assert.equal(traces.status, "collected");
    const parent = traces.traces.find((span) => span.kind === "server");
    const child = traces.traces.find((span) => span.kind === "client");
    assert.ok(parent && child);
    assert.equal(child.parentSpanId, parent.spanId);
    assert.equal(child.traceId, parent.traceId);
    assert.equal(child.attributes["aster.dependency"], "identity");
  } finally {
    await f.close();
    await telemetry.shutdown();
  }
});

test("owner clients send separate fixed operations; only Identity receives the browser credential", async () => {
  const f = await fixture((incoming, response) => {
    const owner = incoming.headers["host"] === "identity:3100" ? "identity" : "playback";
    assert.equal(incoming.url, "/graphql");
    assert.equal(incoming.method, "POST");
    assert.equal(incoming.headers["origin"], "http://engagement:3400");
    assert.equal(
      incoming.headers["x-aster-engagement-credential"],
      owner === "identity" ? credentials.identityCredential : credentials.playbackCredential,
    );
    assert.equal(incoming.headers["x-aster-router-credential"], undefined);
    assert.equal(incoming.headers["x-aster-correlation-id"], id(1));
    assert.equal(incoming.headers["traceparent"], context().traceparent);
    assert.equal(
      incoming.headers["cookie"],
      owner === "identity" ? `aster_local_session=${token}` : undefined,
    );
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    incoming.once("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      assert.equal(
        body["operationName"],
        owner === "identity" ? "EngagementProfile" : "EngagementSession",
      );
      assert.deepEqual(
        body["variables"],
        owner === "identity" ? { profileId: id(3) } : { sessionId: id(4), titleId: id(5) },
      );
      assert.doesNotMatch(JSON.stringify(body), /signature|cookie|manifestUrl/u);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          data:
            owner === "identity"
              ? { _engagementProfile: identity }
              : { _engagementSession: playback },
        }),
      );
    });
  });
  try {
    assert.deepEqual(await f.clients.identity.authorizeProfile(token, id(3), context()), {
      status: "completed",
      value: { accountId: id(2), profileId: id(3), checkedAt: 100, expiresAt: 1000 },
    });
    assert.deepEqual(await f.clients.playback.inspect(id(4), id(5), context()), {
      status: "completed",
      value: { sessionId: id(4), titleId: id(5), checkedAt: 100, createdAt: 90, expiresAt: 1000 },
    });
    assert.equal(f.requests(), 2);
  } finally {
    await f.close();
  }
});

test("Catalog visibility uses its own fixed credential and ordered bounded response without browser/media data", async () => {
  const f = await fixture((incoming, response) => {
    assert.equal(incoming.headers["host"], "catalog:3200");
    assert.equal(incoming.headers["x-aster-engagement-credential"], credentials.catalogCredential);
    assert.equal(incoming.headers["cookie"], undefined);
    assert.equal(incoming.headers["x-aster-playback-credential"], undefined);
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    incoming.once("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      assert.equal(body["operationName"], "EngagementTitles");
      assert.deepEqual(body["variables"], { ids: [id(5), id(6)] });
      assert.doesNotMatch(String(body["query"]), /manifestUrl|publicationId|cookie/u);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { _engagementTitles: catalog } }));
    });
  });
  try {
    assert.deepEqual(await f.clients.catalog.visibility([id(5), id(6)], context()), {
      status: "completed",
      value: { checkedAt: 100, expiresAt: 102, titles: catalog.titles },
    });
    for (const ids of [[], ["bad"], Array.from({ length: 21 }, () => id(5))]) {
      assert.equal((await f.clients.catalog.visibility(ids, context())).status, "invalid_input");
    }
    assert.equal(f.requests(), 1);
    assert.throws(() =>
      createProgressOwnerClients({
        ...credentials,
        catalogCredential: credentials.playbackCredential,
      }),
    );
  } finally {
    await f.close();
  }
});

test("Catalog response substitutions, incomplete batches and excessive snapshot windows fail closed", async () => {
  for (const data of [
    { ...catalog, expiresAt: 900 },
    { ...catalog, titles: [] },
    { ...catalog, titles: [...catalog.titles].reverse() },
    { ...catalog, titles: [{ titleId: id(5), visible: "true" }, catalog.titles[1]] },
  ]) {
    const f = await fixture((_incoming, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { _engagementTitles: data } }));
    });
    try {
      assert.equal(
        (await f.clients.catalog.visibility([id(5), id(6)], context())).status,
        "unavailable",
      );
    } finally {
      await f.close();
    }
  }
});

test("owner client rejects redirects, compression, cookies, overflow and malformed envelopes without retry", async () => {
  for (const mode of [
    "redirect",
    "http",
    "compressed",
    "cookie",
    "declared-size",
    "stream-size",
    "html",
    "malformed",
    "errors",
    "extra",
    "wrong-owner",
    "wrong-time",
  ] as const) {
    const f = await fixture((_incoming, response) => {
      response.setHeader("content-type", mode === "html" ? "text/html" : "application/json");
      if (mode === "redirect") {
        response.statusCode = 302;
        response.setHeader("location", "http://example.invalid");
      }
      if (mode === "http") {
        response.statusCode = 503;
      }
      if (mode === "compressed") {
        response.setHeader("content-encoding", "gzip");
      }
      if (mode === "cookie") {
        response.setHeader("set-cookie", "untrusted=yes");
      }
      if (mode === "declared-size") {
        response.setHeader("content-length", "4097");
      }
      const data = {
        _engagementProfile: {
          ...identity,
          ...(mode === "wrong-owner" ? { profileId: id(9) } : {}),
          ...(mode === "wrong-time" ? { checkedAt: "100" } : {}),
        },
      };
      response.end(
        mode === "stream-size"
          ? "x".repeat(4097)
          : mode === "malformed"
            ? "{"
            : JSON.stringify({
                data,
                ...(mode === "errors" ? { errors: [{ message: "private failure" }] } : {}),
                ...(mode === "extra" ? { extension: {} } : {}),
              }),
      );
    });
    try {
      assert.deepEqual(
        await f.clients.identity.authorizeProfile(token, id(3), context()),
        { status: "unavailable" },
        mode,
      );
      assert.equal(f.requests(), 1);
    } finally {
      await f.close();
    }
  }
});

test("owner failures are typed and invalid inputs or pre-cancellation never dispatch", async () => {
  const f = await fixture((_incoming, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        data: {
          _engagementProfile: {
            code: "NOT_FOUND",
            accountId: null,
            profileId: null,
            checkedAt: null,
            expiresAt: null,
          },
        },
      }),
    );
  });
  try {
    assert.deepEqual(await f.clients.identity.authorizeProfile(token, id(3), context()), {
      status: "not_found",
    });
    for (const credential of ["", "plain", token + ";extra=bad", "a".repeat(3801) + ".b.c"]) {
      assert.equal(
        (await f.clients.identity.authorizeProfile(credential, id(3), context())).status,
        "unauthenticated",
      );
    }
    assert.equal(
      (await f.clients.playback.inspect("invalid", id(5), context())).status,
      "invalid_input",
    );
    assert.equal(
      (await f.clients.playback.inspect(id(4), id(5), context(AbortSignal.abort()))).status,
      "cancelled",
    );
    assert.equal(
      (await f.clients.playback.inspect(id(4), id(5), { ...context(), traceparent: "forged" }))
        .status,
      "invalid_input",
    );
    assert.equal(f.requests(), 1);
    assert.throws(() =>
      createProgressOwnerClients({
        ...credentials,
        playbackCredential: credentials.identityCredential,
      }),
    );
  } finally {
    await f.close();
  }
});

test(
  "owner concurrency has no queue; cancellation and deadline release capacity",
  { timeout: 6000 },
  async () => {
    let requests = 0;
    const entered = Promise.withResolvers<undefined>();
    const f = await fixture((_incoming, response) => {
      if (++requests <= 4) {
        if (requests === 4) {
          entered.resolve(undefined);
        }
        return;
      }
      if (requests === 5) {
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { _engagementSession: playback } }));
    });
    const controller = new AbortController();
    const pending = Array.from({ length: 4 }, () =>
      f.clients.playback.inspect(id(4), id(5), context(controller.signal)),
    );
    try {
      await entered.promise;
      assert.deepEqual(await f.clients.playback.inspect(id(4), id(5), context()), {
        status: "backpressure",
      });
      assert.equal(f.requests(), 4);
      controller.abort();
      assert.ok((await Promise.all(pending)).every((result) => result.status === "cancelled"));
      assert.deepEqual(await f.clients.playback.inspect(id(4), id(5), context()), {
        status: "unavailable",
      });
      assert.equal((await f.clients.playback.inspect(id(4), id(5), context())).status, "completed");
      assert.equal(f.requests(), 6);
    } finally {
      controller.abort();
      await Promise.allSettled(pending);
      await f.close();
    }
  },
);
