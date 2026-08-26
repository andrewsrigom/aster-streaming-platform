import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AsterClockConfigurationError,
  AsterIdentifierConfigurationError,
  AsterIdentifierExhaustedError,
  createAsterDeterministicIdentifierGenerator,
  createAsterFixedClock,
  createAsterSystemClock,
  createAsterUuidGenerator,
} from "../src/index.js";

test("system clock returns a fresh current instant", () => {
  const clock = createAsterSystemClock();
  const before = Date.now();
  const first = clock.now();
  const second = clock.now();
  const after = Date.now();

  assert.equal(Object.isFrozen(clock), true);
  assert.notEqual(first, second);
  assert.equal(first.getTime() >= before && first.getTime() <= after, true);
  assert.equal(second.getTime() >= before && second.getTime() <= after, true);
});

test("fixed clock is deterministic and does not expose mutable shared dates", () => {
  const epochMilliseconds = Date.UTC(2026, 7, 26, 12, 30, 0);
  const clock = createAsterFixedClock(epochMilliseconds);
  const first = clock.now();
  first.setUTCFullYear(1999);

  assert.equal(clock.now().getTime(), epochMilliseconds);
  assert.notEqual(first, clock.now());
});

test("fixed clock rejects invalid epoch values with one cause-free issue", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, 8_640_000_000_000_001]) {
    assert.throws(
      () => createAsterFixedClock(value),
      (error: unknown) => {
        assert.equal(error instanceof AsterClockConfigurationError, true);
        const clockError = error as AsterClockConfigurationError;
        assert.deepEqual(clockError.issues, [{ option: "epochMilliseconds", reason: "invalid" }]);
        assert.equal("cause" in clockError, false);
        return true;
      },
    );
  }
});

test("UUID generator emits distinct RFC 4122 version 4 identifiers", () => {
  const generator = createAsterUuidGenerator();
  const first = generator.generate();
  const second = generator.generate();
  const versionFourUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

  assert.equal(Object.isFrozen(generator), true);
  assert.match(first, versionFourUuid);
  assert.match(second, versionFourUuid);
  assert.notEqual(first, second);
});

test("deterministic identifier generator copies its finite sequence", () => {
  const source = ["request-001", "request-002"];
  const generator = createAsterDeterministicIdentifierGenerator(source);
  source[0] = "mutated-source";

  assert.equal(Object.isFrozen(generator), true);
  assert.equal(generator.generate(), "request-001");
  assert.equal(generator.generate(), "request-002");
  assert.throws(
    () => generator.generate(),
    (error: unknown) => {
      assert.equal(error instanceof AsterIdentifierExhaustedError, true);
      assert.equal("cause" in (error as AsterIdentifierExhaustedError), false);
      return true;
    },
  );
});

test("deterministic identifier configuration is bounded and never invokes accessors", () => {
  let reads = 0;
  const accessorBacked = new Array(1) as string[];
  Object.defineProperty(accessorBacked, "0", {
    get(): string {
      reads += 1;
      return "accessor-secret-never-emit";
    },
  });
  const excessive = new Array(1_025).fill("safe-id") as string[];

  for (const input of [
    [],
    ["contains space"],
    ["x".repeat(129)],
    ["duplicate", "duplicate"],
    accessorBacked,
    excessive,
  ]) {
    assert.throws(
      () => createAsterDeterministicIdentifierGenerator(input),
      (error: unknown) => {
        assert.equal(error instanceof AsterIdentifierConfigurationError, true);
        const identifierError = error as AsterIdentifierConfigurationError;
        assert.deepEqual(identifierError.issues, [{ option: "identifiers", reason: "invalid" }]);
        assert.equal(JSON.stringify(identifierError).includes("secret-never-emit"), false);
        assert.equal("cause" in identifierError, false);
        return true;
      },
    );
  }
  assert.equal(reads, 0);
});

test("clock and identifier declarations contain only repository-owned contracts", async () => {
  const declarations = await Promise.all([
    readFile(new URL("../src/clock.d.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/ids.d.ts", import.meta.url), "utf8"),
  ]);
  const publicContract = declarations.join("\n").toLowerCase();

  for (const vendor of ["pino", "opentelemetry", "postgres", "redis", "kafka", "@aws-sdk"]) {
    assert.equal(publicContract.includes(vendor), false);
  }
});
