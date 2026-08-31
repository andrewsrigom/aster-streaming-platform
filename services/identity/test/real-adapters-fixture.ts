import assert from "node:assert/strict";
import { createServer } from "node:net";

import { createIdentityServiceWithFactories } from "../src/create-service.js";
import { createIdentityHttpServer, type IdentityHttpServer } from "../src/transport/http-server.js";
import { configurationEntries, silentLogger } from "./fixtures.js";

// Test-owned TCP endpoints refuse protocol handshakes; this is not database integration proof.
let postgresConnections = 0;
let redisConnections = 0;
const postgresEndpoint = createServer((socket) => {
  postgresConnections += 1;
  socket.destroy();
});
const redisEndpoint = createServer((socket) => {
  redisConnections += 1;
  socket.destroy();
});
await Promise.all(
  [postgresEndpoint, redisEndpoint].map(
    (server) =>
      new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
      }),
  ),
);
const postgresAddress = postgresEndpoint.address();
const redisAddress = redisEndpoint.address();
assert.ok(postgresAddress && typeof postgresAddress === "object");
assert.ok(redisAddress && typeof redisAddress === "object");
let http: IdentityHttpServer | undefined;
const service = await createIdentityServiceWithFactories(
  configurationEntries.map(([name, value]) => [
    name,
    name === "DATABASE_URL"
      ? `postgresql://127.0.0.1:${postgresAddress.port}/unavailable`
      : name === "REDIS_URL"
        ? `redis://127.0.0.1:${redisAddress.port}/0`
        : value,
  ]),
  {
    logger: silentLogger,
    http: (options) => {
      http = createIdentityHttpServer({ ...options, port: 0 });
      return http;
    },
  },
);
try {
  assert.deepEqual(await service.start(), { status: "started", readiness: "not_ready" });
  assert.equal(service.health().reason, "dependency_unavailable");
  assert.equal(service.health().liveness, "live");
  assert.ok(postgresConnections >= 1);
  assert.equal(redisConnections, 0);
  const port = http?.port();
  assert.ok(port);
  const response = await fetch(`http://127.0.0.1:${port}/health/live`, {
    signal: AbortSignal.timeout(1_000),
    headers: { connection: "close" },
  });
  assert.equal(response.status, 200);
  await response.text();
  assert.equal((await service.shutdown()).outcome, "completed");
} finally {
  await service.shutdown();
  await Promise.all(
    [postgresEndpoint, redisEndpoint].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
}
process.once("beforeExit", () => {
  process.stdout.write("real-adapters-natural-exit\n");
});
