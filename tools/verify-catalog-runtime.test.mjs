import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { validateCatalogRuntime } from "./verify-catalog-runtime.mjs";

const source = await readFile(new URL("../infra/compose/compose.yml", import.meta.url), "utf8");
test("Catalog Compose enforces reader credentials, isolation, bounds and finite migrations", () => {
  assert.deepEqual(validateCatalogRuntime(source), []);
  for (const [before, after] of [
    ["aster_catalog_reader_local@postgres", "aster@postgres"],
    ["127.0.0.1:3200:3200", "0.0.0.0:3200:3200"],
    ['    user: "1000:1000"', '    user: "0:0"'],
    ["    read_only: true", "    read_only: false"],
    ["          memory: 384M", "          memory: 4G"],
    [
      '      ASTER_CATALOG_LOCAL_ENABLED: "true"',
      '      ASTER_CATALOG_LOCAL_ENABLED: "true"\n      ASTER_CATALOG_OPERATOR_ENABLED: "true"',
    ],
    [
      "    networks: [platform, edge]",
      '    networks: [platform, edge]\n    command: ["alternate.js"]',
    ],
    ["  catalog-init:\n", "  unknown-init:\n"],
  ]) {
    assert.ok(validateCatalogRuntime(source.replace(before, after)).length > 0);
  }
});
