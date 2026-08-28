import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { validateCatalogProofVolume, validateCatalogRuntime } from "./verify-catalog-runtime.mjs";
import { serviceBlock } from "./verify-optional-platform.mjs";

const source = await readFile(new URL("../infra/compose/compose.yml", import.meta.url), "utf8");
test("Catalog Compose enforces reader credentials, isolation, bounds and finite migrations", () => {
  assert.deepEqual(validateCatalogRuntime(source), []);
  const block = serviceBlock(source, "catalog");
  for (const [before, after] of [
    ["aster_catalog_reader_local@postgres", "aster@postgres"],
    ["catalog-router-trust:/run/aster-router:ro", "identity-router-trust:/run/aster-router:ro"],
    ['    user: "1000:1000"', '    user: "0:0"'],
    ["    read_only: true", "    read_only: false"],
    ["          memory: 384M", "          memory: 4G"],
    [
      '      ASTER_CATALOG_LOCAL_ENABLED: "true"',
      '      ASTER_CATALOG_LOCAL_ENABLED: "true"\n      ASTER_CATALOG_OPERATOR_ENABLED: "true"',
    ],
    ["    networks: [platform]", '    networks: [platform, edge]\n    ports: ["3200:3200"]'],
    ["      catalog-init:\n", "      unknown-init:\n"],
  ]) {
    assert.ok(
      validateCatalogRuntime(source.replace(block, block.replace(before, after))).length > 0,
      before,
    );
  }
});

test("standalone owner probes use diagnostics without private Router credential mounts", async () => {
  const diagnostic = await readFile(
    new URL("../infra/compose/subgraph-diagnostics.yml", import.meta.url),
    "utf8",
  );
  const probe = await readFile(new URL("./verify-local-catalog.mjs", import.meta.url), "utf8");
  const migrator = await readFile(
    new URL(
      "../services/catalog/src/infrastructure/persistence/local-migrations.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const versions = [...migrator.matchAll(/"(\d{4})-[a-z-]+"/gu)].map((match) => Number(match[1]));
  assert.deepEqual(versions, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(probe.includes(`first.includes('"applied":${JSON.stringify(versions)}')`));
  assert.ok(probe.includes("repeat.includes('\"applied\":[]')"));
  assert.ok(probe.includes('"infra/compose/subgraph-diagnostics.yml"'));
  for (const owner of ["identity", "catalog"]) {
    const block = serviceBlock(diagnostic, owner);
    assert.ok(block.includes("    volumes: !reset []"));
    assert.ok(block.includes('      ASTER_ROUTER_TRUST_ENABLED: "false"'));
    assert.ok(block.includes("    networks: [platform, edge]"));
  }
  assert.ok(probe.includes('"--no-deps"'));
  assert.ok(probe.includes('"127.0.0.1::3200"'));
  assert.ok(probe.includes("assert.ok(volumes.length <= 9)"));
});

test("Catalog proof cleanup allows only owned data and unused trust volumes", () => {
  const project = "aster-catalog-proof-00000000-0000-4000-8000-000000000001";
  const labels = {
    "com.docker.compose.project": project,
    "com.aster.environment": "local",
    "com.aster.owner": "platform",
  };
  for (const [suffix, authority, attached] of [
    ["postgres-data", "durable-local", ["owned"]],
    ["identity-router-trust", "disposable-local", []],
    ["catalog-router-trust", "disposable-local", []],
    ["playback-router-trust", "disposable-local", []],
    ["playback-catalog-trust", "disposable-local", []],
    ["engagement-router-trust", "disposable-local", []],
    ["engagement-identity-trust", "disposable-local", []],
    ["engagement-playback-trust", "disposable-local", []],
    ["engagement-catalog-trust", "disposable-local", []],
  ]) {
    const volume = {
      Name: project + "_" + suffix,
      Labels: { ...labels, "com.aster.authority": authority },
    };
    assert.equal(validateCatalogProofVolume(project, volume, attached, ["owned"]), true);
    assert.equal(validateCatalogProofVolume(project, volume, ["foreign"], ["owned"]), false);
    assert.equal(
      validateCatalogProofVolume(project, { ...volume, Name: project + "_unknown" }, [], []),
      false,
    );
    for (const key of Object.keys(volume.Labels)) {
      assert.equal(
        validateCatalogProofVolume(
          project,
          { ...volume, Labels: { ...volume.Labels, [key]: "foreign" } },
          attached,
          ["owned"],
        ),
        false,
      );
    }
    if (authority === "disposable-local") {
      assert.equal(validateCatalogProofVolume(project, volume, ["owned"], ["owned"]), false);
    }
  }
});
