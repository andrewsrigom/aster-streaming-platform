import assert from "node:assert/strict";

import type { FixtureService } from "./docker-fixture.js";

let requestId = 0;

export async function change(
  service: FixtureService,
  action: "stop" | "start" | "pause" | "unpause",
): Promise<void> {
  const id = ++requestId;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      process.off("message", onMessage);
      reject(new Error("Fixture control deadline exceeded"));
    }, 60_000);
    function onMessage(message: unknown): void {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as Record<string, unknown>)["id"] === id &&
        (message as Record<string, unknown>)["status"] === "completed"
      ) {
        clearTimeout(timer);
        process.off("message", onMessage);
        resolve();
      }
    }
    process.on("message", onMessage);
    assert.equal(typeof process.send, "function");
    process.send?.({ id, service, action });
  });
}
