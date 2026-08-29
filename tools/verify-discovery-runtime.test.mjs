import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

import {
  readDiscoveryRuntimeSources,
  validateDiscoveryRuntime,
} from "./verify-discovery-runtime.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sources = await readDiscoveryRuntimeSources(repositoryRoot);

test("Discovery Compose keeps owner credentials, event activation and disposable proof isolated", () => {
  assert.deepEqual(validateDiscoveryRuntime(sources), []);
  for (const [file, before, after] of [
    ["discovery.yml", 'ASTER_EVENTS_ENABLED: "true"', 'ASTER_EVENTS_ENABLED: "false"'],
    [
      "discovery.yml",
      'ASTER_DISCOVERY_CACHE_ENABLED: "true"',
      'ASTER_DISCOVERY_CACHE_ENABLED: "false"',
    ],
    ["discovery.yml", "redis://redis:6379/0", "redis://catalog:6379/0"],
    [
      "discovery.yml",
      "      ASTER_DISCOVERY_ADMIN_DATABASE_PASSWORD: aster-test-only\n",
      "      ASTER_DISCOVERY_ADMIN_DATABASE_PASSWORD: aster-test-only\n      REDIS_URL: redis://redis:6379/0\n",
    ],
    ["discovery.yml", "postgresql://aster_discovery_local@postgres", "postgresql://aster@postgres"],
    [
      "discovery.yml",
      "postgresql://aster_discovery_projector_local@postgres",
      "postgresql://aster_discovery_local@postgres",
    ],
    [
      "discovery.yml",
      "discovery-catalog-trust:/run/aster-discovery-catalog:ro",
      "catalog-router-trust:/run/aster-discovery-catalog:ro",
    ],
    ["discovery.yml", 'user: "1000:1000"', 'user: "0:0"'],
    ["discovery.yml", "read_only: true", "read_only: false"],
    ["discovery.yml", "pids: 64", "x-pids: 64"],
    ["discovery.yml", "  discovery:\n", "  web:\n"],
    [
      "discovery.yml",
      "services:\n",
      "services:\n  router:\n    depends_on:\n      discovery:\n        condition: service_healthy\n\n",
    ],
    ["events.yml", "aster.catalog.publication.v1", "aster.catalog.unreviewed.v1"],
    [
      "compose.yml",
      "  discovery-router-trust:\n    labels:\n      com.aster.authority: disposable-local",
      "  discovery-router-trust:\n    labels:\n      com.aster.authority: durable-local",
    ],
    ["discovery-proof.yml", "127.0.0.1::4000", "0.0.0.0:4000:4000"],
  ]) {
    const changed = { ...sources, [file]: sources[file].replace(before, after) };
    assert.notEqual(changed[file], sources[file], file + ": " + before);
    assert.ok(validateDiscoveryRuntime(changed).length, file + ": " + before);
  }
});
