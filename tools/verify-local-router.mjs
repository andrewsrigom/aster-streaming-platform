import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const args = process.argv.slice(2);
assert.equal(args.length, 2, "Specify --project and the owned local Compose project.");
assert.equal(args[0], "--project");
const project = args[1];
assert.match(project, /^aster(?:-p04-development|-router-proof-[a-f0-9-]{36})?$/);
const execute = promisify(execFile);
const docker = async (args) =>
  (await execute("docker", args, { timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true }))
    .stdout;
const containers = {};
for (const service of ["router", "identity", "catalog"]) {
  const id = (
    await docker([
      "ps",
      "--quiet",
      "--no-trunc",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--filter",
      `label=com.docker.compose.service=${service}`,
    ])
  ).trim();
  assert.match(id, /^[a-f0-9]{64}$/);
  const [info] = JSON.parse(await docker(["inspect", id]));
  assert.equal(info.Config.Labels["com.aster.scope"], "platform");
  assert.equal(info.Config.Labels["com.aster.environment"], "local");
  assert.equal(info.HostConfig.ReadonlyRootfs, true);
  assert.equal(info.Config.User, "1000:1000");
  assert.deepEqual(
    Object.keys(info.HostConfig.PortBindings ?? {}),
    service === "router" ? ["4000/tcp"] : [],
  );
  if (service === "router") {
    assert.deepEqual(info.HostConfig.PortBindings["4000/tcp"], [
      { HostIp: "127.0.0.1", HostPort: "4000" },
    ]);
  }
  containers[service] = id;
}

const origin = "http://127.0.0.1:4000";
const baseHeaders = { origin, "x-aster-csrf": "1", "content-type": "application/json" };
const titleId = randomUUID();
let cookie;
let paused = false;
let stage = "public-boundary";
const record = (event, details = {}) =>
  process.stdout.write(JSON.stringify({ event, ...details }) + "\n");
async function call(
  query,
  {
    operationName = /^(?:query|mutation)\s+(\w+)/.exec(query)?.[1],
    headers = {},
    variables = {},
    path = "/graphql",
  } = {},
) {
  const start = performance.now();
  const response = await globalThis.fetch(origin + path, {
    method: "POST",
    headers: { ...baseHeaders, ...(cookie ? { cookie } : {}), ...headers },
    body: JSON.stringify({ operationName, query, variables }),
    signal: globalThis.AbortSignal.timeout(5000),
  });
  const text = await response.text();
  assert.ok(text.length <= 262144);
  return {
    status: response.status,
    headers: response.headers,
    text,
    body: JSON.parse(text),
    durationMs: performance.now() - start,
  };
}
const viewer = "query Viewer { me { accountId } }";
const mixed = "query ViewerAndTitle($id:ID!) { me { accountId } title(id:$id) { id } }";
async function duplicateHeader() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: viewer });
    const client = request(
      origin + "/graphql",
      {
        method: "POST",
        headers: [
          ...Object.entries(baseHeaders).flat(),
          "origin",
          origin,
          "content-length",
          String(Buffer.byteLength(body)),
          "connection",
          "close",
        ],
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      },
    );
    client.setTimeout(3000, () => client.destroy(new Error("Duplicate-header probe timed out.")));
    client.on("error", reject);
    client.end(body);
  });
}

try {
  for (const headers of [
    { origin: "http://attacker.invalid" },
    { "x-aster-account-id": "forged" },
    { "x-aster-router-credential": "forged" },
    { authorization: "Bearer forged" },
    { "x-forwarded-host": "identity:3100" },
    { "x-aster-csrf": "0" },
    { traceparent: "00-" + "a".repeat(32) + "-" + "b".repeat(16) + "-01" },
  ]) {
    assert.equal((await call(viewer, { headers })).status, 403);
  }
  assert.equal(await duplicateHeader(), 400);
  assert.equal((await call(viewer, { path: "/graphql?untrusted=1" })).status, 400);
  assert.equal((await call(viewer + " ".repeat(33000))).status, 413);
  record("aster.router.public_boundary_verified", { cases: 10 });

  stage = "session";
  const login = await call("mutation DemoSignIn { demoSignIn { code } }");
  assert.equal(login.status, 200);
  assert.equal(login.body.data?.demoSignIn?.code, "COMPLETED");
  const issued = login.headers.get("set-cookie");
  assert.match(issued, /HttpOnly; SameSite=Strict/);
  assert.ok(!issued.includes("Domain="));
  cookie = issued.split(";")[0];
  assert.ok(!login.text.includes(cookie));
  const authenticated = await call(mixed, { variables: { id: titleId } });
  assert.equal(authenticated.body.errors, undefined);
  assert.ok(authenticated.body.data.me.accountId);
  assert.equal(authenticated.body.data.title, null);
  assert.equal(authenticated.headers.get("cache-control"), "no-store");
  const noPlan = await call(viewer, { headers: { "apollo-expose-query-plan": "true" } });
  assert.equal(noPlan.body.extensions?.apolloQueryPlan, undefined);
  record("aster.router.session_and_two_owners_verified");

  stage = "private-boundary";
  const denied = await docker([
    "exec",
    containers.identity,
    "node",
    "--input-type=module",
    "-e",
    'import{readFile}from"node:fs/promises";const key=await readFile("/run/aster-router/identity.key","utf8");const r=await fetch("http://catalog:3200/graphql",{method:"POST",headers:{origin:"http://127.0.0.1:4000","x-aster-csrf":"1","x-aster-router-credential":key,"content-type":"application/json"},body:JSON.stringify({query:"query Browse { titles(first:1) { pageInfo { hasNextPage } } }"}),signal:AbortSignal.timeout(3000)});await r.body.cancel();console.log(r.status);',
  ]);
  assert.equal(denied.trim(), "403");
  record("aster.router.private_boundary_verified", {
    publishedSubgraphPorts: 0,
    crossOwnerCredentialStatus: 403,
  });

  stage = "partial-timeout";
  await docker(["pause", containers.catalog]);
  paused = true;
  const partial = await call(mixed, { variables: { id: titleId } });
  assert.equal(partial.status, 200);
  assert.ok(partial.body.data.me.accountId);
  assert.equal(partial.body.data.title, null);
  assert.ok(partial.body.errors?.length);
  assert.ok(partial.durationMs >= 1500 && partial.durationMs < 4500);
  assert.ok(!partial.text.includes("http://") && !partial.text.includes(":3200"));
  record("aster.router.partial_timeout_verified", {
    durationMs: Math.round(partial.durationMs),
    healthyOwnerPreserved: true,
  });
  stage = "concurrency";
  const burst = await Promise.all(
    Array.from({ length: 12 }, () =>
      call("query TitleDetail($id:ID!) { title(id:$id) { id } }", { variables: { id: titleId } }),
    ),
  );
  assert.ok(burst.some((r) => r.status === 503));
  assert.ok(burst.some((r) => r.status === 200 && r.body.errors?.length));
  record("aster.router.concurrency_verified", {
    requests: 12,
    rejected: burst.filter((r) => r.status === 503).length,
  });
  await docker(["unpause", containers.catalog]);
  paused = false;
  stage = "recovery";
  const recoveryStarted = performance.now();
  let recovered;
  do {
    recovered = await call(mixed, { variables: { id: titleId } });
    if (recovered.body.errors === undefined) {
      break;
    }
    await delay(100);
  } while (performance.now() - recoveryStarted < 5000);
  assert.equal(recovered.body.errors, undefined);
  record("aster.router.recovery_verified", {
    durationMs: Math.round(performance.now() - recoveryStarted),
  });

  stage = "revocation";
  const previous = cookie;
  const logout = await call("mutation SignOut { signOut { code } }");
  assert.equal(logout.body.data?.signOut.code, "COMPLETED");
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  cookie = previous;
  const revoked = await call(viewer);
  assert.equal(revoked.body.data.me, null);
  cookie = undefined;
  record("aster.router.revocation_verified");
} catch {
  record("aster.router.verification_failed", { stage });
  process.exitCode = 1;
} finally {
  if (paused) {
    await docker(["unpause", containers.catalog]);
  }
  if (cookie) {
    await call("mutation SignOut { signOut { code } }").catch(() => {
      process.exitCode = 1;
    });
  }
}
