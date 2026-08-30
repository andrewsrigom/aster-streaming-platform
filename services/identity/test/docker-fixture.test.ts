import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  configurationSourceMatches,
  DockerFixture,
  type FixtureProfile,
} from "./integration/docker-fixture.js";

function dockerModel(profile: FixtureProfile = "core") {
  const services =
    profile === "all"
      ? ["postgres", "redis", "broker", "storage", "collector", "prometheus"]
      : profile === "core"
        ? ["postgres", "redis"]
        : profile === "telemetry"
          ? ["postgres", "redis", "collector", "prometheus"]
          : [profile];
  const volumeNames =
    profile === "all"
      ? ["postgres-data", "broker-data", "storage-data", "prometheus-data"]
      : profile === "core"
        ? ["postgres-data"]
        : profile === "telemetry"
          ? ["postgres-data", "prometheus-data"]
          : [`${profile}-data`];
  const calls: string[][] = [];
  let resources: Record<string, Array<Record<string, unknown>>> = {
    container: [],
    network: [],
    volume: [],
  };
  let endpoint = "unix:///var/run/docker.sock";
  let collision = false;
  const fixture = new DockerFixture(profile, (input, environment, timeout) => {
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
        return result(services.join("\n"));
      }
      assert.ok(args.includes("up"));
      const composeFile = args.filter((_arg, index) => args[index - 1] === "--file").join(",");
      resources = {
        container: services.map((service, index) => ({
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
          Mounts: [
            ...(service === "redis"
              ? [{ Type: "tmpfs" }]
              : service === "collector"
                ? []
                : [{ Type: "volume", Name: `${project}_${service}-data` }]),
            ...(service === "collector" || service === "prometheus"
              ? [
                  {
                    Type: "bind",
                    Source: fileURLToPath(
                      new URL(
                        `../../../../infra/compose/${service}.integration.yml`,
                        import.meta.url,
                      ),
                    ),
                    Destination: `/etc/aster/${service}.yml`,
                    RW: false,
                    Propagation: "rprivate",
                  },
                ]
              : []),
          ],
        })),
        network: [
          {
            Id: "9".repeat(64),
            Name: `${project}_platform`,
            Labels: { ...labels, "com.docker.compose.network": "platform" },
            Containers: {},
          },
        ],
        volume: volumeNames.map((volumeName) => ({
          Name: `${project}_${volumeName}`,
          Labels: {
            ...labels,
            "com.docker.compose.volume": volumeName,
            "com.aster.authority": "disposable-fixture",
            "com.aster.owner": "integration",
          },
        })),
      };
      return result("");
    }
    if (args[0] === "logs") {
      assert.deepEqual(args.slice(0, 3), ["logs", "--tail", "512"]);
      assert.ok(resources["container"]?.some((item) => item["Id"] === args[3]));
      return result("Name: aster.http.server https://private.example/path aster-test-only");
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
    ["1".repeat(64), "2".repeat(64), `${model.fixture.project}_postgres-data`, "9".repeat(64)],
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

test("storage cleanup owns only its fixed service and volume, not the core profile", async () => {
  const model = dockerModel("storage");
  await model.fixture.start();
  await assert.rejects(model.fixture.change("postgres", "stop"), /outside this fixture profile/);
  assert.equal(model.fixture.hasService("storage"), true);
  assert.equal(model.fixture.hasService("postgres"), false);
  await model.fixture.cleanup();
  assert.deepEqual(
    model.calls.filter((args) => args[1] === "rm").map((args) => args.at(-1)),
    ["1".repeat(64), `${model.fixture.project}_storage-data`, "9".repeat(64)],
  );
});

test("broker cleanup removes its exact named volume and rejects an anonymous image volume", async () => {
  const model = dockerModel("broker");
  await model.fixture.start();
  const container = model.resources()["container"]?.[0];
  assert.ok(container);
  const originalMounts = container["Mounts"];
  container["Mounts"] = [{ Type: "volume", Name: "anonymous-unowned" }];
  await assert.rejects(model.fixture.cleanup(), /Unexpected fixture mount/);
  assert.ok(!model.calls.some((args) => args[1] === "rm"));
  container["Mounts"] = originalMounts;
  await model.fixture.cleanup();
  assert.deepEqual(
    model.calls.filter((args) => args[1] === "rm").map((args) => args.at(-1)),
    ["1".repeat(64), `${model.fixture.project}_broker-data`, "9".repeat(64)],
  );
});

test("telemetry fixture allows only exact read-only config mounts and its two volumes", async () => {
  const model = dockerModel("telemetry");
  await model.fixture.start();
  assert.equal(model.fixture.hasService("collector"), true);
  assert.equal(model.fixture.hasService("broker"), false);
  assert.equal(
    await model.fixture.logs("collector"),
    "Name: aster.http.server [fixture endpoint] [fixture credential]",
  );
  await assert.rejects(model.fixture.logs("collector", 0), /bounded range/);
  await assert.rejects(model.fixture.logs("broker"), /outside this fixture profile/);
  const collector = model.resources()["container"]?.[2];
  assert.ok(collector);
  const mounts = collector["Mounts"] as Record<string, unknown>[];
  const mount = mounts[0];
  assert.ok(mount);
  const original = { ...mount };
  for (const [field, value] of [
    ["RW", true],
    ["Propagation", "rshared"],
    ["Source", "/unowned/config.yml"],
    ["Destination", "/different/config.yml"],
  ]) {
    assert.equal(typeof field, "string");
    mount[field as string] = value;
    await assert.rejects(model.fixture.cleanup(), /Unexpected fixture mount/);
    assert.ok(!model.calls.some((args) => args[1] === "rm"));
    Object.assign(mount, original);
  }
  await model.fixture.cleanup();
  assert.deepEqual(
    model.calls.filter((args) => args[1] === "rm").map((args) => args.at(-1)),
    [
      ...[1, 2, 3, 4].map((value) => String(value).repeat(64)),
      `${model.fixture.project}_postgres-data`,
      `${model.fixture.project}_prometheus-data`,
      "9".repeat(64),
    ],
  );
});

test("Docker Desktop bind translation requires exact distro and file identity, not a path prefix", async () => {
  const source = `/run/desktop/mnt/host/wsl/docker-desktop-bind-mounts/Ubuntu-20.04/${"a".repeat(64)}`;
  const expected = "/fixture/collector.integration.yml";
  const checked: string[] = [];
  const same = async (path: string) => {
    checked.push(path);
    return Promise.resolve({ dev: 123, ino: 456, isFile: () => true });
  };
  assert.equal(await configurationSourceMatches(source, expected, "Ubuntu-20.04", same), true);
  assert.deepEqual(checked, [
    expected,
    `/mnt/wsl/docker-desktop-bind-mounts/Ubuntu-20.04/${"a".repeat(64)}`,
  ]);
  assert.equal(await configurationSourceMatches(source, expected, "Different", same), false);
  assert.equal(
    await configurationSourceMatches(`${source}/../elsewhere`, expected, "Ubuntu-20.04", same),
    false,
  );
  assert.equal(checked.length, 2);
  assert.equal(
    await configurationSourceMatches(source, expected, "Ubuntu-20.04", async (path) =>
      Promise.resolve({ dev: 123, ino: path === expected ? 456 : 789, isFile: () => true }),
    ),
    false,
  );
  assert.equal(
    await configurationSourceMatches(source, expected, "Ubuntu-20.04", () =>
      Promise.reject(new Error("Missing translated mount")),
    ),
    false,
  );
});

test("combined matrix owns only six fixed services and four labelled volumes", async () => {
  const model = dockerModel("all");
  await model.fixture.start();
  assert.equal(model.resources()["container"]?.length, 6);
  assert.equal(model.resources()["volume"]?.length, 4);
  assert.equal(model.fixture.hasService("unowned"), false);
  await model.fixture.cleanup();
  assert.equal(model.calls.filter((args) => args[1] === "rm").length, 11);
  assert.ok(Object.values(model.resources()).every((resources) => resources.length === 0));
});
