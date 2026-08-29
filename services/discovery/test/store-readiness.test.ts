import assert from "node:assert/strict";
import test from "node:test";
import { discoveryLocalSchemaCompatible } from "../src/infrastructure/local-migrations.js";
import { discoverySearchSchemaCompatible } from "../src/infrastructure/store-readiness.js";

test("released migrator accepts bootstrap, partial current and the staged successor", () => {
  assert.equal(discoveryLocalSchemaCompatible([], false), true);
  assert.equal(discoveryLocalSchemaCompatible([1], true), true);
  assert.equal(discoveryLocalSchemaCompatible([1, 2], true), true);
  assert.equal(discoveryLocalSchemaCompatible([1, 2, 3], true), true);
});

test("released migrator rejects empty, gapped, rewritten and future schemas", () => {
  for (const versions of [[], [2], [1, 3], [1, 2, 4], [1, 2, 3, 4]]) {
    assert.equal(discoveryLocalSchemaCompatible(versions, true), false);
  }
});

test("released search readiness accepts its schema and the staged additive successor", () => {
  assert.equal(discoverySearchSchemaCompatible([{ version: 1 }, { version: 2 }]), true);
  assert.equal(
    discoverySearchSchemaCompatible([{ version: 1 }, { version: 2 }, { version: 3 }]),
    true,
  );
});

test("released search readiness rejects bootstrap, gaps, rewrites and future versions", () => {
  for (const value of [
    undefined,
    [],
    [{ version: 1 }],
    [{ version: 1 }, { version: 3 }],
    [{ version: 1 }, { version: 2 }, { version: 4 }],
    [{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }],
  ]) {
    assert.equal(discoverySearchSchemaCompatible(value), false);
  }
});

test("schema compatibility does not invoke hostile row accessors", () => {
  let invoked = false;
  const hostile = Object.defineProperty({}, "version", {
    get() {
      invoked = true;
      return 2;
    },
  });
  assert.equal(discoverySearchSchemaCompatible([{ version: 1 }, hostile]), false);
  assert.equal(invoked, false);
});
