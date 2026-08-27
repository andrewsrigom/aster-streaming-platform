import assert from "node:assert/strict";
import test from "node:test";

import { CoreDockerFixture } from "./integration/docker-fixture.js";

function dockerModel() {
  const calls: string[][] = [];
  let resources: Record<string, Array<Record<string, unknown>>> = {
    container: [],
    network: [],
    volume: [],
  };
  let endpoint = "unix:///var/run/docker.sock";
  let collision = false;
  const fixture = new CoreDockerFixture((input, environment, timeout) => {
    assert.ok(timeout > 0 && timeout <= 120_000);
    const args = input[0] === "--host" ? input.slice(2) : input;
    calls.push(args);
    const project = environment["ASTER_INTEGRATION_PROJECT"];
    assert.ok(project);
    assert.match(project, /^aster-integration-[a-f0-9]{32}$/);
    const labels = {
      "com.docker.compose.project": project,
      "com.aster.fixture": project,
      "com.aster.scope": "p01-r09",
      "com.aster.environment": "integration",
    };
    const result = (value: string) => Promise.resolve(value);
    if (args[0] === "context") {
      return result(args[1] === "show" ? "default" : endpoint);
    }
    assert.equal(input[1], "unix:///var/run/docker.sock");
    if (args[0] === "info") {
      return result("linux");
    }
    if (args[0] === "compose") {
      if (args.includes("config")) {
        return result("postgres\nredis");
      }
      assert.ok(args.includes("up"));
      const composeFile = args[args.indexOf("--file") + 1];
      resources = {
        container: ["postgres", "redis"].map((service, index) => ({
          Id: String(index + 1).repeat(64),
          Name: `/${project}-${service}-1`,
          Config: {
            Labels: {
              ...labels,
              "com.docker.compose.service": service,
              "com.docker.compose.project.config_files": composeFile,
            },
          },
          State: { Paused: false },
          Mounts:
            service === "postgres"
              ? [{ Type: "volume", Name: `${project}_postgres-data` }]
              : [{ Type: "tmpfs" }],
        })),
        network: [
          {
            Id: "3".repeat(64),
            Name: `${project}_platform`,
            Labels: { ...labels, "com.docker.compose.network": "platform" },
            Containers: {},
          },
        ],
        volume: [
          {
            Name: `${project}_postgres-data`,
            Labels: {
              ...labels,
              "com.docker.compose.volume": "postgres-data",
              "com.aster.authority": "disposable-fixture",
              "com.aster.owner": "integration",
            },
          },
        ],
      };
      return result("");
    }
    const kind = args[0];
    assert.ok(kind === "container" || kind === "network" || kind === "volume");
    const owned = resources[kind] ?? [];
    if (args[1] === "ls") {
      if (args.some((arg) => arg.startsWith("name="))) {
        return result(collision ? "unowned-collision" : "");
      }
      return result(owned.map((item) => String(item["Id"] ?? item["Name"])).join("\n"));
    }
    if (args[1] === "inspect") {
      return result(JSON.stringify(owned));
    }
    assert.equal(args[1], "rm");
    const id = args.at(-1);
    assert.ok(owned.some((item) => (item["Id"] ?? item["Name"]) === id));
    resources[kind] = owned.filter((item) => (item["Id"] ?? item["Name"]) !== id);
    return result("");
  });
  return {
    fixture,
    calls,
    resources: () => resources,
    endpoint: (value: string) => {
      endpoint = value;
    },
    collide: () => {
      collision = true;
    },
  };
}

test("integration refuses remote Docker before creating or removing resources", async () => {
  const model = dockerModel();
  model.endpoint("ssh://untrusted.example");
  await assert.rejects(model.fixture.start(), /local Docker socket/);
  await model.fixture.cleanup();
  assert.equal(model.calls.length, 2);
});

test("integration refuses a name collision without touching existing resources", async () => {
  const model = dockerModel();
  model.collide();
  await assert.rejects(model.fixture.start(), /collides/);
  await model.fixture.cleanup();
  assert.ok(!model.calls.some((args) => args.includes("up") || args.includes("rm")));
});

test("fixture cleanup removes only exact owned IDs and is idempotent", async () => {
  const model = dockerModel();
  await model.fixture.start();
  await model.fixture.cleanup();
  const callCount = model.calls.length;
  await model.fixture.cleanup();
  assert.equal(model.calls.length, callCount);
  const removals = model.calls.filter((args) => args[1] === "rm");
  assert.equal(removals.length, 4);
  assert.deepEqual(
    removals.map((args) => args.at(-1)),
    ["1".repeat(64), "2".repeat(64), `${model.fixture.project}_postgres-data`, "3".repeat(64)],
  );
  assert.ok(!model.calls.some((args) => args.includes("prune") || args.includes("down")));
});

test("fixture cleanup refuses changed ownership before the first removal", async () => {
  const model = dockerModel();
  await model.fixture.start();
  const volume = model.resources()["volume"]?.[0];
  assert.ok(volume);
  (volume["Labels"] as Record<string, unknown>)["com.aster.fixture"] = "another-fixture";
  await assert.rejects(model.fixture.cleanup());
  assert.ok(!model.calls.some((args) => args[1] === "rm"));
});

test("fixture fault injection refuses changed container ownership", async () => {
  const model = dockerModel();
  await model.fixture.start();
  const container = model.resources()["container"]?.[0];
  assert.ok(container);
  const labels = (container["Config"] as Record<string, unknown>)["Labels"] as Record<
    string,
    unknown
  >;
  labels["com.docker.compose.project"] = "aster";
  await assert.rejects(model.fixture.change("postgres", "stop"));
  assert.ok(!model.calls.some((args) => args[1] === "stop"));
});

test("fixture cleanup refuses foreign mounts and network attachments", async () => {
  for (const mutation of ["mount", "network"]) {
    const model = dockerModel();
    await model.fixture.start();
    if (mutation === "mount") {
      const container = model.resources()["container"]?.[0];
      assert.ok(container);
      container["Mounts"] = [{ Type: "bind", Source: "/unowned" }];
    } else {
      const network = model.resources()["network"]?.[0];
      assert.ok(network);
      network["Containers"] = { ["f".repeat(64)]: {} };
    }
    await assert.rejects(model.fixture.cleanup());
    assert.ok(!model.calls.some((args) => args[1] === "rm"));
  }
});
