import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { Pool } from "pg";

import { createAsterPostgresAdapter } from "../src/index.js";

test("real pool owns background errors without exposing vendor error details", async (context) => {
  const createdPools = new Set<Pool>();
  context.mock.method(
    Pool.prototype,
    "on",
    function (this: Pool, event: string, listener: (...args: unknown[]) => void) {
      createdPools.add(this);
      return EventEmitter.prototype.on.call(this, event, listener) as Pool;
    },
  );
  const adapter = createAsterPostgresAdapter({
    connectionString: "postgresql://127.0.0.1/unused",
    telemetry: {
      startDependencyOperation: () => ({ status: "rejected", reason: "telemetry_closed" }),
    },
  });
  const [pool] = createdPools;
  assert.ok(pool);
  assert.equal(pool.listenerCount("error"), 1);
  assert.doesNotThrow(() => {
    pool.emit("error", new Error("vendor-secret-never-emit"));
    pool.emit("error", new Error("second-idle-client-failure"));
  });
  assert.equal(adapter.snapshot().state, "open");
  assert.equal((await adapter.close()).status, "completed");
});
