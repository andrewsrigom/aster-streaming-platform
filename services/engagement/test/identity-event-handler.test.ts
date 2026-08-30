import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";
import type { AsterPostgresAdapter } from "@aster/postgres";
import type { AsterLogger } from "@aster/runtime";
import type {
  AsterDependencyCompletion,
  AsterDependencyObservationInput,
  AsterTelemetry,
} from "@aster/telemetry";
import { createIdentityEventHandler } from "../src/infrastructure/identity-event-handler.js";
import {
  eventCredential,
  identityEnvelope,
  signedIdentityRecord,
} from "./identity-event-fixture.js";

test("links valid identity consumption to the producing trace context", async () => {
  const started: AsterDependencyObservationInput[] = [];
  const completed: AsterDependencyCompletion[] = [];
  const deliveries: unknown[] = [];
  const active = new AsyncLocalStorage<boolean>();
  const telemetry: Pick<AsterTelemetry, "startDependencyOperation" | "recordEventDelivery"> = {
    startDependencyOperation(input) {
      started.push(input);
      return {
        status: "started",
        observation: {
          run: (operation) => active.run(true, operation),
          complete(completion) {
            completed.push(completion);
            return { status: "completed" };
          },
        },
      };
    },
    recordEventDelivery(input) {
      assert.equal(active.getStore(), true);
      deliveries.push(input);
      return { status: "recorded" };
    },
  };
  const database = {
    async transaction(work: Parameters<AsterPostgresAdapter["transaction"]>[0]) {
      assert.equal(active.getStore(), true);
      const decision = await work({
        query: () => Promise.resolve({ rowCount: 1, rows: [{ outcome: "applied" }] }),
      });
      return { status: "committed", value: decision.value };
    },
  } as unknown as AsterPostgresAdapter;
  const entries: unknown[] = [];
  const logger: Pick<AsterLogger, "info"> = {
    info(entry) {
      assert.equal(active.getStore(), true);
      entries.push(entry);
      return "written";
    },
  };
  const traceparent = `00-${"a".repeat(32)}-${"b".repeat(16)}-01`;
  const record = signedIdentityRecord({ ...identityEnvelope(), trace: { traceparent } });
  const handler = createIdentityEventHandler(database, eventCredential, logger, telemetry);

  await handler({
    key: record.key,
    value: record.value,
    headers: record.headers,
    partition: record.partition,
    offset: record.offset,
    signal: new AbortController().signal,
  });

  assert.deepEqual(started, [
    { dependency: "broker", operation: "consume", linkedTraceparent: traceparent },
  ]);
  assert.deepEqual(completed, [{ outcome: "success" }]);
  assert.equal(deliveries.length, 1);
  assert.deepEqual(
    { ...(deliveries[0] as Record<string, unknown>), ageMs: undefined },
    { owner: "identity", stage: "consume", outcome: "success", ageMs: undefined },
  );
  assert.equal(entries.length, 1);
  assert.doesNotMatch(JSON.stringify(entries), /traceparent|accountId|profileId/u);
});
