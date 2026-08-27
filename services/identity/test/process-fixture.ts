import assert from "node:assert/strict";

import { createIdentityServiceWithFactories } from "../src/create-service.js";
import { createAsterIdentityRuntime } from "../src/reference-runtime.js";
import { createIdentityHttpServer } from "../src/transport/http-server.js";
import { configurationEntries, controlledDependency, silentLogger } from "./fixtures.js";

const mode = process.argv[2];
const postgresql = controlledDependency();
const redis = controlledDependency();
const service = await createIdentityServiceWithFactories(configurationEntries, {
  logger: silentLogger,
  postgresql: () => ({
    ...postgresql,
    ...(mode?.startsWith("force")
      ? {
          close: () => new Promise<never>(() => undefined),
        }
      : {}),
  }),
  redis: () => redis,
  http: (options) => createIdentityHttpServer({ ...options, port: 0 }),
  runtime: (options) => createAsterIdentityRuntime({ ...options, shutdownDeadlineMs: 100 }),
});
assert.equal((await service.start()).status, "started");
process.once("beforeExit", () => {
  assert.ok(postgresql.state.closed);
  assert.ok(redis.state.closed);
  process.stdout.write("natural-exit\n");
});
if (mode === "force-manual") {
  await service.shutdown();
} else {
  const lease = service.tryBeginWork();
  assert.ok(lease);
  service.bindProcessSignals();
  process.kill(process.pid, "SIGTERM");
  setTimeout(() => {
    assert.equal(service.health().phase, "draining");
    lease.complete();
  }, 20);
}
