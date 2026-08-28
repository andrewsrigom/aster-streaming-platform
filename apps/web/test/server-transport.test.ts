import assert from "node:assert/strict";
import { createServer, request, type RequestListener } from "node:http";
import test, { type TestContext } from "node:test";
import { createPublicRouterFetch } from "../lib/apollo/server-transport.ts";
import { boundedGraphqlFetch } from "../lib/apollo/transport.ts";

const endpoint = "http://router:4000/graphql";
const data = { titles: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } } };
const init = { method: "POST", body: JSON.stringify({ operationName: "Browse" }) };

async function fixture(t: TestContext, listener: RequestListener) {
  const server = createServer(listener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const fetcher = createPublicRouterFetch((_url, options, receive) =>
    request(new URL(`http://127.0.0.1:${address.port}/graphql`), options, receive),
  );
  return boundedGraphqlFetch(fetcher);
}

test("server transport preserves exact Host over real HTTP and strips private headers", async (t) => {
  const fetcher = await fixture(t, (incoming, response) => {
    assert.equal(incoming.headers.host, "127.0.0.1:4000");
    assert.equal(incoming.headers.origin, "http://127.0.0.1:4000");
    assert.equal(incoming.headers["x-aster-csrf"], "1");
    assert.equal(incoming.headers.cookie, undefined);
    assert.equal(incoming.headers.authorization, undefined);
    assert.equal(incoming.headers["x-aster-router-credential"], undefined);
    response.writeHead(200, { "content-type": "application/json", "set-cookie": "private=canary" });
    response.end(JSON.stringify({ data }));
  });
  for (let index = 0; index < 3; index++) {
    const result = await fetcher(endpoint, {
      ...init,
      headers: {
        cookie: "private=canary",
        authorization: "private",
        "x-aster-router-credential": "private",
      },
    });
    assert.equal(result.headers.get("set-cookie"), null);
    assert.deepEqual(await result.json(), { data });
  }
});

test("server transport rejects destinations, redirects and malformed or oversized bodies", async (t) => {
  let mode = "redirect";
  const fetcher = await fixture(t, (_incoming, response) => {
    if (mode === "redirect") {
      response.writeHead(302, { location: "http://private.invalid/" });
      response.end();
    } else {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(mode === "large" ? "x".repeat(262145) : "private error");
    }
  });
  await assert.rejects(fetcher("http://private.invalid/graphql", init));
  for (mode of ["redirect", "malformed", "large"]) {
    await assert.rejects(fetcher(endpoint, init));
  }
});

test("server cancellation releases a saturated bounded transport", async (t) => {
  let received = 0;
  let complete: () => void = () => undefined;
  const admitted = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let hold = true;
  const fetcher = await fixture(t, (_incoming, response) => {
    if (hold) {
      received++;
      if (received === 16) {
        complete();
      }
    } else {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data }));
    }
  });
  const controller = new AbortController();
  const requests = Array.from({ length: 16 }, () =>
    fetcher(endpoint, { ...init, signal: controller.signal }).then(
      () => "unexpected",
      () => "cancelled",
    ),
  );
  await admitted;
  await assert.rejects(fetcher(endpoint, init), /Catalog is temporarily unavailable/u);
  controller.abort();
  assert.deepEqual(
    await Promise.all(requests),
    Array.from({ length: 16 }, () => "cancelled"),
  );
  hold = false;
  assert.deepEqual(await (await fetcher(endpoint, init)).json(), { data });
});
