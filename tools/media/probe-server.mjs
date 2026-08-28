import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire, stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const importMap = '{"imports":{"hls.js":"/hls.mjs"}}';
const importHash = createHash("sha256").update(importMap).digest("base64");
const csp = [
  "default-src 'none'",
  "script-src 'self' 'sha256-" + importHash + "'",
  "worker-src blob:",
  "connect-src http://127.0.0.1:9001",
  "media-src blob:",
  "style-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");

async function boundedAsset(path) {
  assert.ok((await stat(path)).size <= 2 * 1024 * 1024, "Oversized probe asset.");
  return readFile(path);
}
export async function createProbeServer(bundleHash) {
  assert.match(bundleHash, /^[a-f0-9]{64}$/u);
  const hlsRoot = dirname(require.resolve("hls.js/package.json"));
  const library = await boundedAsset(join(hlsRoot, "dist/hls.min.mjs"));
  const license = await boundedAsset(join(hlsRoot, "LICENSE"));
  const source = await boundedAsset(new URL("./probe-client.ts", import.meta.url));
  const script = stripTypeScriptTypes(source.toString("utf8"), { mode: "strip" });
  const prefix = "http://127.0.0.1:9001/aster-media-published/publications/" + bundleHash + "/";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aster — HLS acceptance probe</title><link rel="stylesheet" href="/probe.css">
<script type="importmap">${importMap}</script><script type="module" src="/probe.mjs"></script>
</head><body><main><h1>HLS acceptance probe</h1>
<p>Phase 06 technical check. Not the product player. Six decoded-frame samples; 90-second limit.</p>
<video playsinline muted aria-label="Big Buck Bunny playback"></video>
<p><button id="start">Run acceptance</button> <button id="stop" disabled>Stop</button></p>
<p><a id="manifest" href="${prefix}master.m3u8">Published HLS manifest</a> ·
<a href="${prefix}attribution.json">Film credits and modifications</a> ·
<a href="/HLS-LICENSE.txt">HLS.js 1.7.1 license and notices</a></p>
<pre id="report" aria-live="polite">Ready</pre></main></body></html>`;
  const assets = new Map([
    ["/", ["text/html; charset=utf-8", html]],
    ["/probe.mjs", ["text/javascript; charset=utf-8", script]],
    ["/hls.mjs", ["text/javascript; charset=utf-8", library]],
    ["/HLS-LICENSE.txt", ["text/plain; charset=utf-8", license]],
    [
      "/probe.css",
      [
        "text/css; charset=utf-8",
        "body{font:16px system-ui;margin:24px;background:#121620;color:#eef}main{max-width:900px;margin:auto}video{width:640px;max-width:100%;background:#000}a{color:#9df}button{padding:10px}pre{white-space:pre-wrap;font-size:13px}",
      ],
    ],
  ]);
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000 },
    (request, response) => {
      const asset = assets.get(request.url);
      if (
        request.headers.host !== "127.0.0.1:3000" ||
        !["GET", "HEAD"].includes(request.method) ||
        request.headers["content-length"] ||
        request.headers["transfer-encoding"] ||
        !asset
      ) {
        response.writeHead(404, { Connection: "close", "Content-Length": "0" });
        response.end();
        return;
      }
      const [contentType, body] = asset;
      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
        "Content-Security-Policy": csp,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    },
  );
  server.maxConnections = 16;
  server.maxRequestsPerSocket = 32;
  server.keepAliveTimeout = 2000;
  server.setTimeout(5000, (socket) => socket.destroy());
  return server;
}
