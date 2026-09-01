import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { performance } from "node:perf_hooks";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import {
  assertFederatedQueryBudget,
  PREPARE_QUERY_COUNT_SQL,
  READ_QUERY_COUNT_SQL,
  RESET_QUERY_COUNT_SQL,
  selectCurrentTrustedOperation,
} from "./graphql-query-count-proof.mjs";

assert.equal(process.argv.length, 2, "Discovery proof accepts no target or extra flags.");
const root = fileURLToPath(new URL("../", import.meta.url));
const project = "aster-discovery-proof-" + randomUUID();
const execute = promisify(execFile);
const composeArgs = [
  "compose",
  "--parallel",
  "1",
  "--project-name",
  project,
  "--file",
  "infra/compose/compose.yml",
  "--file",
  "infra/compose/demo.yml",
  "--file",
  "infra/compose/events.yml",
  "--file",
  "infra/compose/discovery.yml",
  "--file",
  "infra/compose/discovery-proof.yml",
  "--file",
  "infra/compose/query-count-proof.yml",
  "--profile",
  "runtime",
];
const allowedServices = new Set([
  "postgres",
  "catalog-init",
  "catalog",
  "playback-init",
  "playback",
  "router-trust-init",
  "broker",
  "broker-init",
  "discovery-init",
  "discovery",
  "router",
]);
const docker = async (args, timeout = 15_000) => {
  const result = await execute("docker", args, {
    cwd: root,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout.trim();
};
const compose = (args, timeout) => docker([...composeArgs, ...args], timeout);
const emit = (event, facts) => process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
const browseOperation =
  "query Browse($first:Int!,$locale:String!){titles(first:$first){edges{node{id localized(locale:$locale){title}}}}}";
const knownOperations = await readFile(root + "infra/router/known-operations.graphql", "utf8");
const persistedOperations = await readFile(
  root + "infra/router/generated/persisted-query-manifest.json",
  "utf8",
);
const deliveryManifest = await readFile(root + "infra/router/generated/manifest.json", "utf8");
const titleDetailOperation = selectCurrentTrustedOperation(
  persistedOperations,
  deliveryManifest,
  "TitleDetail",
);
const searchOperation = selectCurrentTrustedOperation(
  persistedOperations,
  deliveryManifest,
  "SearchTitles",
);
const measuredHomePublicOperation = selectCurrentTrustedOperation(
  persistedOperations,
  deliveryManifest,
  "HomePublic",
);
const knownOperation = (name) => {
  const start = knownOperations.indexOf("query " + name + "(");
  assert.notEqual(start, -1, "Missing known operation " + name + ".");
  const next = knownOperations.indexOf("\n\nquery ", start + 1);
  return knownOperations.slice(start, next === -1 ? undefined : next).trim();
};
const homePersonalizedOperation = knownOperation("HomePersonalized");

async function executeGraphql(port, payload, timeoutMs = 5_000) {
  const body = Buffer.from(JSON.stringify(payload));
  assert.ok(body.byteLength < 16_384);
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/graphql",
        method: "POST",
        signal: globalThis.AbortSignal.timeout(timeoutMs),
        headers: {
          host: "127.0.0.1:4000",
          origin: "http://127.0.0.1:4000",
          "x-aster-csrf": "1",
          "content-type": "application/json",
          "content-length": String(body.byteLength),
        },
      },
      (incoming) => {
        const parts = [];
        let size = 0;
        incoming.on("data", (chunk) => {
          size += chunk.byteLength;
          if (size > 32_768) {
            incoming.destroy(new Error("Discovery response exceeds its proof bound."));
          } else {
            parts.push(chunk);
          }
        });
        incoming.once("error", reject);
        incoming.once("end", () => {
          try {
            resolve({
              status: incoming.statusCode,
              body: JSON.parse(Buffer.concat(parts, size).toString("utf8")),
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Invalid Discovery response."));
          }
        });
      },
    );
    outgoing.once("error", reject);
    outgoing.end(body);
  });
}

const graphql = (port, query, timeoutMs) =>
  executeGraphql(
    port,
    {
      query: searchOperation.body,
      operationName: "SearchTitles",
      variables: { query, locale: "en", first: 5 },
    },
    timeoutMs,
  );

const isTransientSubrequestFailure = (response) => {
  const errors = response.body?.errors;
  return (
    response.status === 200 &&
    Array.isArray(errors) &&
    errors.length > 0 &&
    errors.every(
      (error) =>
        typeof error === "object" &&
        error !== null &&
        typeof error.extensions === "object" &&
        error.extensions !== null &&
        error.extensions.code === "SUBREQUEST_HTTP_ERROR",
    )
  );
};

async function waitForDiscoveryRecovery(port, query, expectedGeneration) {
  const startedAt = performance.now();
  const deadlineAt = startedAt + 10_000;
  let attempts = 0;

  while (performance.now() < deadlineAt) {
    attempts += 1;
    const remainingMs = Math.max(1, Math.ceil(deadlineAt - performance.now()));
    const response = await graphql(port, query, Math.min(1_000, remainingMs));
    const errors = response.body?.errors;
    const generation = response.body?.data?.searchTitles?.connection?.generation;

    if (response.status === 200 && errors === undefined && generation === expectedGeneration) {
      return {
        attempts,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
      };
    }
    if (response.status !== 200) {
      throw new Error("Discovery recovery returned a non-success HTTP status.");
    }
    if (errors === undefined) {
      throw new Error("Discovery recovery returned an unexpected projection generation.");
    }
    if (!isTransientSubrequestFailure(response)) {
      throw new Error("Discovery recovery returned an unexpected GraphQL error.");
    }

    const delayMs = Math.min(250, Math.max(0, deadlineAt - performance.now()));
    if (delayMs > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Discovery recovery exceeded its 10-second end-to-end deadline.");
}

const postgres = (sql) =>
  compose([
    "exec",
    "-T",
    "postgres",
    "psql",
    "--username=aster",
    "--dbname=aster",
    "--set=ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--command",
    sql,
  ]);

async function measureOperation(port, operation, variables, maximumByOwner, workload) {
  await postgres(RESET_QUERY_COUNT_SQL);
  const startedAt = performance.now();
  const response = await executeGraphql(port, {
    query: operation.body,
    operationName: operation.name,
    variables,
  });
  const durationMs = Number((performance.now() - startedAt).toFixed(3));
  const observed = JSON.parse(await postgres(READ_QUERY_COUNT_SQL));
  const perOwner = Object.fromEntries(
    Object.keys(maximumByOwner).map((owner) => [owner, observed[owner]]),
  );
  const queries = assertFederatedQueryBudget(operation.name, perOwner, maximumByOwner);
  emit("phase13_federated_query_count", {
    operation: operation.name,
    operationId: operation.id,
    mode: "exact_trusted_document_through_router",
    workload,
    queries,
    perOwner,
    nonParticipantOwnerActivityExcluded: Object.keys(observed)
      .filter((owner) => !(owner in maximumByOwner))
      .sort(),
    durationMs,
    limitation: "single disposable local observation; not a throughput or SLO claim",
  });
  return response;
}

let stage = "config";
let failure;
const started = performance.now();
try {
  await compose(["config", "--quiet"]);
  stage = "build";
  emit("discovery_runtime_build", { project, status: "started" });
  await compose(
    [
      "build",
      "catalog",
      "catalog-init",
      "playback",
      "playback-init",
      "discovery",
      "discovery-init",
      "router",
      "router-trust-init",
    ],
    900_000,
  );
  emit("discovery_runtime_build", { project, status: "completed" });

  stage = "start";
  await compose(
    ["up", "--no-build", "--wait", "--wait-timeout", "180", "router", "discovery"],
    240_000,
  );
  const ids = (await compose(["ps", "--all", "--quiet"])).split("\n").filter(Boolean);
  const containers = JSON.parse(await docker(["inspect", ...ids]));
  const services = new Set(
    containers.map((container) => container.Config.Labels["com.docker.compose.service"]),
  );
  assert.equal(containers.length, allowedServices.size);
  assert.deepEqual(services, allowedServices);
  const discovery = containers.find(
    (container) => container.Config.Labels["com.docker.compose.service"] === "discovery",
  );
  assert.equal(discovery.State.Health.Status, "healthy");
  assert.ok(discovery.Config.Env.includes("ASTER_DISCOVERY_CACHE_ENABLED=true"));
  assert.ok(discovery.Config.Env.includes("REDIS_URL=redis://redis:6379/0"));
  assert.equal(discovery.Config.User, "1000:1000");
  assert.equal(discovery.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(discovery.HostConfig.CapDrop, ["ALL"]);
  assert.ok(discovery.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  emit("discovery_runtime_started", {
    project,
    services: containers.length,
    images: Object.fromEntries(
      containers
        .filter((container) =>
          ["catalog", "discovery", "router"].includes(
            container.Config.Labels["com.docker.compose.service"],
          ),
        )
        .map((container) => [
          container.Config.Labels["com.docker.compose.service"],
          container.Image,
        ]),
    ),
  });

  await compose(["stop", "--timeout", "5", "playback"], 15_000);
  const [stoppedPlayback] = JSON.parse(await docker(["inspect", project + "-playback-1"]));
  assert.equal(stoppedPlayback.State.Running, false);
  emit("phase13_query_count_isolation", {
    stoppedNonParticipantServices: ["playback"],
    excludedActivity: "declared readiness probes and non-participating owner roles",
  });

  const endpoint = await compose(["port", "router", "4000"]);
  const match = /^127\.0\.0\.1:([1-9][0-9]{3,4})$/u.exec(endpoint);
  assert.ok(match);
  const port = Number(match[1]);
  await postgres(PREPARE_QUERY_COUNT_SQL);
  const titleDetail = await measureOperation(
    port,
    titleDetailOperation,
    { id: "00000000-0000-4000-8000-000005000001", locale: "en" },
    { catalog: 2 },
    "one published title with materialized metadata",
  );
  assert.equal(titleDetail.status, 200);
  assert.equal(titleDetail.body.errors, undefined);
  assert.equal(titleDetail.body.data?.title?.id, "00000000-0000-4000-8000-000005000001");
  assert.equal(titleDetail.body.data?.title?.localized?.title, "Signal / 01");

  const found = await measureOperation(
    port,
    searchOperation,
    { query: "Signal", locale: "en", first: 5 },
    { catalog: 2, discovery: 3 },
    "one matching result from three visible projection rows, first 5",
  );
  assert.equal(found.status, 200);
  assert.equal(found.body.errors, undefined);
  const payload = found.body.data?.searchTitles;
  assert.equal(payload?.code, "COMPLETED");
  assert.match(payload?.correlationId ?? "", /^[a-f0-9-]{36}$/u);
  assert.equal(payload?.connection?.edges?.length, 1);
  const edge = payload.connection.edges[0];
  assert.equal(edge.node.id, "00000000-0000-4000-8000-000005000001");
  assert.equal(edge.node.localized.locale, "en");
  assert.equal(edge.node.localized.title, "Signal / 01");
  assert.equal(edge.visibleUntil - edge.indexedAt, 300);
  assert.equal(payload.connection.pageInfo.hasNextPage, false);
  const empty = await graphql(port, "missing-result-fixture");
  assert.equal(empty.status, 200);
  assert.equal(empty.body.data?.searchTitles?.code, "COMPLETED");
  assert.deepEqual(empty.body.data?.searchTitles?.connection?.edges, []);
  emit("discovery_federated_search", {
    resultCount: 1,
    zeroResult: "explicit-empty",
    sourceVersion: edge.sourceVersion,
    freshnessSeconds: edge.visibleUntil - edge.indexedAt,
  });

  const publicHome = await measureOperation(
    port,
    measuredHomePublicOperation,
    { first: 1, locale: "en" },
    { catalog: 2, discovery: 5 },
    "featured, recent, trending and genre rails with one visible title",
  );
  assert.equal(publicHome.status, 200);
  assert.equal(publicHome.body.errors, undefined);
  const homePayload = publicHome.body.data?.homeRails;
  assert.equal(homePayload?.code, "PARTIAL");
  assert.equal(homePayload?.featured?.code, "FALLBACK");
  assert.equal(homePayload?.featured?.rail?.source, "RECENTLY_ADDED");
  assert.equal(homePayload?.featured?.rail?.edges?.length, 1);
  assert.equal(homePayload?.recentlyAdded?.code, "COMPLETED");
  assert.equal(homePayload?.trending?.code, "FALLBACK");
  assert.equal(homePayload?.genres?.code, "COMPLETED");
  assert.equal(homePayload?.genres?.rails?.[0]?.genre, "experimental");

  const personalizedHome = await executeGraphql(port, {
    query: homePersonalizedOperation,
    operationName: "HomePersonalized",
    variables: {
      profileId: "00000000-0000-4000-8000-000000090201",
      first: 1,
      locale: "en",
    },
  });
  assert.equal(personalizedHome.status, 200);
  assert.ok(personalizedHome.body.errors?.length > 0);
  assert.equal(personalizedHome.body.data?.homeRails?.recentlyAdded?.code, "COMPLETED");
  assert.equal(personalizedHome.body.data?.homeContinueWatching, null);
  emit("discovery_home_runtime", {
    publicRails: 4,
    recentFallback: true,
    ownerPartialResponse: true,
  });
  emit("discovery_cache_outage_runtime", {
    redisStarted: false,
    discoveryHealthy: true,
    publicHomeServed: true,
  });

  stage = "state";
  const projection = JSON.parse(
    await compose([
      "exec",
      "-T",
      "postgres",
      "psql",
      "--username=aster",
      "--dbname=aster",
      "--tuples-only",
      "--no-align",
      "--command",
      "SELECT jsonb_build_object('activeGeneration',c.active_generation,'state',g.state,'rows',g.rows_applied,'documents',(SELECT count(*) FROM discovery.search_documents WHERE generation_id=c.active_generation),'fences',(SELECT count(*) FROM discovery.title_fences)) FROM discovery.generation_control c JOIN discovery.generations g ON g.id=c.active_generation;",
    ]),
  );
  assert.equal(projection.state, "ACTIVE");
  assert.notEqual(projection.activeGeneration, "00000000-0000-4000-8000-000000090001");
  assert.equal(projection.rows, 1);
  assert.equal(projection.documents, 2);
  assert.equal(projection.fences, 1);
  const offsets = await compose([
    "exec",
    "-T",
    "--env",
    "KAFKA_HEAP_OPTS=-Xms16m -Xmx64m",
    "--env",
    "KAFKA_JVM_PERFORMANCE_OPTS=-XX:ActiveProcessorCount=1 -XX:TieredStopAtLevel=1",
    "broker",
    "/opt/kafka/bin/kafka-consumer-groups.sh",
    "--bootstrap-server",
    "broker:19092",
    "--describe",
    "--group",
    "aster-discovery-catalog-v1",
  ]);
  const offsetLine = offsets
    .split("\n")
    .find((line) => line.trimStart().startsWith("aster-discovery-catalog-v1 "));
  assert.ok(offsetLine);
  const columns = offsetLine.trim().split(/\s+/u);
  assert.equal(columns[1], "aster.catalog.publication.v1");
  assert.equal(columns[2], "0");
  assert.equal(columns[3], columns[4]);
  assert.equal(columns[5], "0");
  emit("discovery_projection_runtime", {
    activeGeneration: projection.activeGeneration,
    projectedTitles: projection.rows,
    documents: projection.documents,
    brokerLag: 0,
  });

  stage = "replay";
  const quarantineId = "00000000-0000-4000-8000-000000090099";
  const replayTitleId = "00000000-0000-4000-8000-000005000001";
  const replayEvent = JSON.stringify({
    eventId: "00000000-0000-4000-8000-000000090101",
    eventType: "catalog.title-published",
    schemaVersion: 1,
    occurredAt: "2026-08-29T00:00:00.000Z",
    producer: "catalog",
    aggregate: { type: "Title", id: replayTitleId, version: edge.sourceVersion },
    correlationId: "00000000-0000-4000-8000-000000090102",
    causationId: "00000000-0000-4000-8000-000000090103",
    trace: {},
    payload: { titleId: replayTitleId, publicationId: null, rightsRevision: null },
  });
  const quarantine = await compose([
    "exec",
    "-T",
    "postgres",
    "psql",
    "--username=aster",
    "--dbname=aster",
    "--tuples-only",
    "--no-align",
    "--command",
    `SELECT discovery.quarantine_catalog_record(
      '${quarantineId}'::uuid,'aster.catalog.publication.v1',0,'999999',
      '${Buffer.from(replayTitleId).toString("hex")}',
      '${Buffer.from(replayEvent).toString("hex")}','{}'::jsonb,'source_conflict');`,
  ]);
  assert.equal(quarantine, "stored");
  const replay = JSON.parse(
    await compose([
      "exec",
      "-T",
      "--env",
      "ASTER_DISCOVERY_REPLAY_ENABLED=true",
      "discovery",
      "node",
      "./dist/src/replay-catalog-event.js",
      quarantineId,
    ]),
  );
  assert.equal(replay.event, "aster.discovery.catalog_replay");
  assert.ok(replay.status === "applied" || replay.status === "duplicate");
  const remainingQuarantine = await compose([
    "exec",
    "-T",
    "postgres",
    "psql",
    "--username=aster",
    "--dbname=aster",
    "--tuples-only",
    "--no-align",
    "--command",
    `SELECT count(*) FROM discovery.event_quarantine WHERE id='${quarantineId}'::uuid;`,
  ]);
  assert.equal(remainingQuarantine, "0");
  emit("discovery_quarantine_replay", { exactRecord: true, reclaimed: true });

  stage = "isolation";
  await compose(["stop", "--timeout", "15", "discovery"], 30_000);
  const browse = await executeGraphql(port, {
    query: browseOperation,
    operationName: "Browse",
    variables: { first: 1, locale: "en" },
  });
  assert.equal(browse.status, 200);
  assert.equal(browse.body.errors, undefined);
  assert.equal(browse.body.data?.titles?.edges?.length, 1);
  emit("discovery_failure_isolation", { routerReady: true, catalogBrowse: true });

  stage = "restart";
  await compose(
    ["up", "--no-build", "--wait", "--wait-timeout", "90", "discovery", "router"],
    120_000,
  );
  const recovery = await waitForDiscoveryRecovery(port, "Signal", projection.activeGeneration);
  emit("discovery_restart_recovery", {
    generationPreserved: true,
    searchRecovered: true,
    attempts: recovery.attempts,
    durationMs: recovery.durationMs,
  });

  const logs = await compose(["logs", "--no-color", "--tail", "200", "discovery", "router"]);
  for (const required of [
    '"event":"aster.discovery.rebuild_state","outcome":"ok"',
    '"event":"aster.discovery.readiness_changed","outcome":"ok"',
    '"event":"aster.discovery.cache_readiness_changed","outcome":"degraded"',
    '"event":"aster.discovery.graphql_completed"',
    '"operation":"search_titles"',
    '"aster.operation":"SearchTitles"',
  ]) {
    assert.ok(logs.includes(required), required);
  }
  assert.doesNotMatch(
    logs,
    /aster-test-only|x-aster-(?:router|discovery)-credential|Signal \/ 01|searchTitles\s*\(|Timeout(?:Negative|Overflow)Warning/u,
  );
  emit("discovery_runtime_logs", {
    finiteOperations: true,
    rawQueryText: false,
    secrets: false,
    timerWarnings: false,
  });
} catch (error) {
  failure = error;
} finally {
  try {
    const logs = await compose(
      ["logs", "--no-color", "--tail", "40", "discovery", "catalog", "router"],
      20_000,
    );
    if (failure) {
      process.stderr.write(logs + "\n");
    }
  } catch {
    // The primary result remains actionable if log collection is unavailable.
  }
  try {
    await compose(["down", "--volumes", "--timeout", "10"], 90_000);
    for (const kind of ["container", "network", "volume"]) {
      const remaining = await docker([
        kind,
        "ls",
        ...(kind === "container" ? ["--all"] : []),
        "--quiet",
        "--filter",
        "label=com.docker.compose.project=" + project,
      ]);
      assert.equal(remaining, "", "Discovery proof leaked " + kind + " resources.");
    }
    emit("discovery_runtime_cleaned", {
      project,
      remaining: 0,
      durationMs: Math.round(performance.now() - started),
    });
  } catch (cleanupError) {
    failure ??= cleanupError;
  }
}
if (failure) {
  throw new Error("Discovery runtime proof failed at " + stage + ".", { cause: failure });
}
