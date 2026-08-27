import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import test from "node:test";

import { httpProbe } from "./integration/http-probe.js";

async function withServer(listener: RequestListener, work: (port: number) => Promise<void>) {
  const server = createServer(listener);
  server.maxConnections = 2;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await work(address.port);
  } finally {
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
  }
}

test("fixture HTTP probe bounds response bytes and refuses redirects", async () => {
  await withServer(
    (request, response) => {
      if (request.url === "/oversized") {
        response.end(Buffer.alloc(128 * 1_024 + 1, 97));
      } else if (request.url === "/redirect") {
        response.writeHead(302, { location: "http://unowned.invalid/" }).end();
      } else {
        request.resume();
        response.end("{}");
      }
    },
    async (port) => {
      assert.deepEqual(await httpProbe(port, "/v1/metrics", "{}"), { status: 200, body: "{}" });
      await assert.rejects(httpProbe(port, "/oversized"), /byte limit/);
      await assert.rejects(httpProbe(port, "/redirect"));
      await assert.rejects(httpProbe(0, "/"));
    },
  );
});

test("fixture HTTP deadline covers a stalled response body, not only headers", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(200);
      response.write("{");
    },
    async (port) => {
      const started = performance.now();
      await assert.rejects(httpProbe(port, "/"), { name: "AbortError" });
      assert.ok(performance.now() - started < 2_500);
    },
  );
});
