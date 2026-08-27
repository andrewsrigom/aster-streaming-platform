import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { URL } from "node:url";
import pg from "pg";

// Executed inside an ownership-validated local Catalog container by tools/verify-router-lifecycle.mjs.
const url = new URL(process.env.ASTER_CATALOG_READER_DATABASE_URL);
assert.equal(process.env.ASTER_ENVIRONMENT, "local");
assert.equal(url.hostname, "postgres");
assert.equal(url.pathname, "/aster");
const { ASTER_CATALOG_READER_DATABASE_PASSWORD: password } = process.env;
const options = {
  host: url.hostname,
  port: Number(url.port || 5432),
  database: "aster",
  user: "aster",
  password,
  connectionTimeoutMillis: 1000,
  query_timeout: 1500,
  statement_timeout: 1000,
  idle_in_transaction_session_timeout: 5000,
  application_name: "aster_router_cancel_proof",
};
const lock = new pg.Client(options);
const observer = new pg.Client(options);
const controller = new globalThis.AbortController();
let response;
const started = performance.now();
try {
  await lock.connect();
  await observer.connect();
  await lock.query("BEGIN");
  await lock.query("LOCK TABLE catalog.titles IN ACCESS EXCLUSIVE MODE");
  response = new Promise((resolve) => {
    const body = JSON.stringify({
      operationName: "TitleDetail",
      query: "query TitleDetail($id:ID!){title(id:$id){id}}",
      variables: { id: randomUUID() },
    });
    const client = request(
      "http://router:4000/graphql",
      {
        method: "POST",
        headers: {
          host: "127.0.0.1:4000",
          origin: "http://127.0.0.1:4000",
          "x-aster-csrf": "1",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
        signal: globalThis.AbortSignal.any([
          controller.signal,
          globalThis.AbortSignal.timeout(4000),
        ]),
      },
      (result) => {
        result.resume();
        resolve("responded");
      },
    );
    client.on("error", () => resolve("disconnected"));
    client.end(body);
  });
  let waiting = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = await observer.query(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename='aster_catalog_reader_local' AND state='active' AND wait_event_type='Lock' AND query LIKE '%catalog.public_candidates%'",
    );
    if (result.rows[0].count === 1) {
      waiting = true;
      break;
    }
    await delay(10);
  }
  assert.ok(waiting, "Catalog must start the real blocked read before client disconnection.");
  const abortedAt = performance.now();
  controller.abort();
  assert.equal(await response, "disconnected");
  // Owner telemetry is checked by the host driver; the held lock rules out successful completion.
  await delay(150);
  process.stdout.write(
    JSON.stringify({
      event: "aster.router.client_disconnected",
      readObserved: true,
      abortMs: Math.round(performance.now() - abortedAt),
      setupMs: Math.round(abortedAt - started),
    }) + "\n",
  );
} finally {
  controller.abort();
  await response;
  await lock.query("ROLLBACK").catch(() => undefined);
  await Promise.allSettled([lock.end(), observer.end()]);
}
