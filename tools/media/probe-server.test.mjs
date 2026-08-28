import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";
import { createProbeServer } from "./probe-server.mjs";

test("local probe serves only bounded scripts/notices and never proxies media", async () => {
  await assert.rejects(createProbeServer("../unsafe"));
  const server = await createProbeServer("a".repeat(64));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const call = (path, headers = {}, method = "GET") =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path,
          method,
          headers: { Host: "127.0.0.1:3000", ...headers },
          timeout: 2000,
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("error", reject);
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString(),
            }),
          );
        },
      );
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("Probe request timeout.")));
      req.end();
    });
  try {
    const page = await call("/");
    assert.equal(page.status, 200);
    assert.match(
      page.body,
      /127\.0\.0\.1:9001\/aster-media-published\/publications\/a{64}\/master\.m3u8/u,
    );
    assert.match(
      page.headers["content-security-policy"],
      /connect-src http:\/\/127\.0\.0\.1:9001/u,
    );
    assert.match(page.headers["content-security-policy"], /frame-ancestors 'none'/u);
    assert.equal(page.headers["cache-control"], "no-store");
    assert.equal(page.headers["referrer-policy"], "no-referrer");
    assert.match((await call("/probe.mjs")).body, /requestVideoFrameCallback/u);
    assert.doesNotMatch((await call("/probe.mjs")).body, /type Sample/u);
    assert.match((await call("/hls.mjs")).body, /1\.7\.1/u);
    assert.match((await call("/HLS-LICENSE.txt")).body, /Copyright \(c\) 2017 Dailymotion/u);
    assert.equal((await call("/", {}, "HEAD")).body, "");
    for (const path of [
      "/media.ts",
      "/master.m3u8",
      "/../package.json",
      "/?url=http://elsewhere",
      "/hls.mjs.map",
    ]) {
      assert.equal((await call(path)).status, 404);
    }
    assert.equal((await call("/", { Host: "elsewhere:3000" })).status, 404);
    assert.equal((await call("/", {}, "POST")).status, 404);
    assert.equal((await call("/", { "Content-Length": "1" })).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
