import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { createServer } from "node:net";
import { devNull } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { httpProbe } from "./http-probe.js";

const execute = promisify(execFile);
const scope = "p01-r09";
export type CoreService = "postgres" | "redis";
export type FixtureService = CoreService | "storage" | "broker" | "collector" | "prometheus";
export type FixtureProfile = "core" | "storage" | "broker" | "telemetry";
const servicePorts: Readonly<Record<FixtureService, number>> = {
  postgres: 5432,
  redis: 6379,
  storage: 9000,
  broker: 9092,
  collector: 4318,
  prometheus: 9090,
};
const profiles: Readonly<
  Record<
    FixtureProfile,
    { files: readonly string[]; services: readonly FixtureService[]; volumes: readonly string[] }
  >
> = {
  core: { files: ["integration.yml"], services: ["postgres", "redis"], volumes: ["postgres-data"] },
  storage: { files: ["integration-storage.yml"], services: ["storage"], volumes: ["storage-data"] },
  broker: { files: ["integration-broker.yml"], services: ["broker"], volumes: ["broker-data"] },
  telemetry: {
    files: ["integration.yml", "integration-telemetry.yml"],
    services: ["postgres", "redis", "collector", "prometheus"],
    volumes: ["postgres-data", "prometheus-data"],
  },
};
const configurationMounts = {
  collector: { source: "collector.integration.yml", destination: "/etc/aster/collector.yml" },
  prometheus: { source: "prometheus.integration.yml", destination: "/etc/aster/prometheus.yml" },
} as const;

function composePath(filename: string): string {
  return fileURLToPath(new URL(`../../../../../infra/compose/${filename}`, import.meta.url));
}
type ResourceKind = "container" | "network" | "volume";
type RecordValue = Record<string, unknown>;
type Resource = Readonly<{ id: string; name: string; value: RecordValue; labels: RecordValue }>;
type DockerCommand = (
  args: string[],
  environment: NodeJS.ProcessEnv,
  timeout: number,
) => Promise<string>;

const runDocker: DockerCommand = async (args, environment, timeout) => {
  const result = await execute("docker", args, {
    env: environment,
    timeout,
    killSignal: "SIGKILL",
    maxBuffer: 512 * 1_024,
    encoding: "utf8",
    windowsHide: true,
  });
  return (args.includes("logs") ? result.stdout + result.stderr : result.stdout).trim();
};

function safeDiagnostic(value: string, limit: number): string {
  return value
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi, "[fixture endpoint]")
    .replaceAll("aster-test-only", "[fixture credential]")
    .slice(0, limit);
}

type FileIdentity = Readonly<{ dev: number; ino: number; isFile(): boolean }>;

export async function configurationSourceMatches(
  source: unknown,
  expected: string,
  wslDistribution: string | undefined,
  identity: (path: string) => Promise<FileIdentity> = lstat,
): Promise<boolean> {
  if (source === expected) {
    return true;
  }
  if (typeof source !== "string" || !wslDistribution) {
    return false;
  }
  const match =
    /^\/run\/desktop\/mnt\/host\/wsl\/docker-desktop-bind-mounts\/([a-zA-Z0-9._-]{1,64})\/([a-f0-9]{64})$/.exec(
      source,
    );
  if (!match || match[1] !== wslDistribution) {
    return false;
  }
  // Docker Desktop may rewrite a bind source on restart. A path prefix or equal contents
  // alone is not ownership: the translated bind must be the very same device/inode.
  try {
    const [original, translated] = await Promise.all([
      identity(expected),
      identity(`/mnt/wsl/docker-desktop-bind-mounts/${match[1]}/${match[2]}`),
    ]);
    return (
      original.isFile() &&
      translated.isFile() &&
      original.dev === translated.dev &&
      original.ino === translated.ino
    );
  } catch {
    return false;
  }
}

function record(value: unknown): RecordValue {
  assert.ok(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "Invalid Docker response",
  );
  return value as RecordValue;
}

function records(value: string): RecordValue[] {
  const parsed: unknown = JSON.parse(value);
  assert.ok(Array.isArray(parsed) && parsed.length <= 8, "Unexpected Docker inventory size");
  return parsed.map(record);
}

function textField(value: unknown): string {
  assert.equal(typeof value, "string", "Invalid Docker text field");
  return value as string;
}

export async function eventually(
  description: string,
  check: () => boolean | Promise<boolean>,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  do {
    if (await check()) {
      return;
    }
    await delay(50);
  } while (performance.now() < deadline);
  assert.fail(`Timed out: ${description}`);
}

export class DockerFixture {
  constructor(
    readonly profile: FixtureProfile = "core",
    private readonly command: DockerCommand = runDocker,
  ) {}

  private get definition() {
    return profiles[this.profile];
  }

  private get composeFiles(): string[] {
    return this.definition.files.map(composePath);
  }

  hasService(value: unknown): value is FixtureService {
    return this.definition.services.some((service) => service === value);
  }

  readonly project = `aster-integration-${randomUUID().replaceAll("-", "")}`;
  private endpoint: string | undefined;
  private created = false;
  private readonly ports: Partial<Record<FixtureService, number>> = {};
  private readonly environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("DOCKER_") && !key.startsWith("COMPOSE_"),
    ),
  );

  private async docker(args: string[], timeout = 10_000): Promise<string> {
    try {
      return await this.command(
        this.endpoint ? ["--host", this.endpoint, ...args] : args,
        {
          ...this.environment,
          ASTER_INTEGRATION_PROJECT: this.project,
          ...Object.fromEntries(
            Object.entries(this.ports).map(([service, port]) => [
              `ASTER_INTEGRATION_${service.toUpperCase()}_PORT`,
              String(port),
            ]),
          ),
        },
        timeout,
      );
    } catch (error) {
      // Docker errors can echo connection settings. Keep the failing operation, not its arguments.
      const stderr =
        typeof error === "object" && error !== null && "stderr" in error ? error.stderr : undefined;
      if (typeof stderr === "string") {
        process.stdout.write(
          `${JSON.stringify({ event: "fixture_command_failed", operation: args[0], detail: safeDiagnostic(stderr, 2_048) })}\n`,
        );
      }
      // eslint-disable-next-line preserve-caught-error -- Raw Docker causes may contain connection credentials.
      throw new Error(
        `Integration Docker ${args[0] ?? "command"} failed or exceeded its deadline.`,
      );
    }
  }

  private compose(args: string[], timeout?: number): Promise<string> {
    return this.docker(
      [
        "compose",
        "--env-file",
        devNull,
        "--project-name",
        this.project,
        ...this.composeFiles.flatMap((file) => ["--file", file]),
        ...args,
      ],
      timeout,
    );
  }

  private async inventory(kind: ResourceKind): Promise<Resource[]> {
    const output = await this.docker([
      kind,
      "ls",
      ...(kind === "container" ? ["--all"] : []),
      "--quiet",
      "--filter",
      `label=com.docker.compose.project=${this.project}`,
    ]);
    const identifiers = output.split(/\s+/).filter(Boolean);
    assert.ok(
      identifiers.length <=
        (kind === "container"
          ? this.definition.services.length
          : kind === "volume"
            ? this.definition.volumes.length
            : 1),
      "Unexpected fixture inventory",
    );
    if (identifiers.length === 0) {
      return [];
    }
    return records(await this.docker([kind, "inspect", ...identifiers])).map((value) => {
      const labels = record(
        kind === "container" ? record(value["Config"])["Labels"] : value["Labels"],
      );
      const name = textField(value["Name"]).replace(/^\//, "");
      assert.equal(labels["com.docker.compose.project"], this.project);
      assert.equal(labels["com.aster.fixture"], this.project);
      assert.equal(labels["com.aster.environment"], "integration");
      assert.equal(labels["com.aster.scope"], scope);
      if (kind === "container") {
        const service = labels["com.docker.compose.service"];
        assert.ok(this.hasService(service), "Unowned fixture service");
        assert.equal(name, `${this.project}-${service}-1`);
        assert.equal(
          labels["com.docker.compose.project.config_files"],
          this.composeFiles.join(","),
        );
      } else if (kind === "network") {
        assert.equal(labels["com.docker.compose.network"], "platform");
        assert.equal(name, `${this.project}_platform`);
      } else {
        const volume = labels["com.docker.compose.volume"];
        assert.ok(typeof volume === "string" && this.definition.volumes.includes(volume));
        assert.equal(labels["com.aster.authority"], "disposable-fixture");
        assert.equal(labels["com.aster.owner"], "integration");
        assert.equal(name, `${this.project}_${volume}`);
      }
      const id = kind === "volume" ? name : textField(value["Id"]);
      if (kind !== "volume") {
        assert.match(id, /^[a-f0-9]{64}$/);
      }
      return { id, name, value, labels };
    });
  }

  async start(): Promise<void> {
    assert.equal(this.created, false, "Fixture cannot start twice");
    for (const [service, mount] of Object.entries(configurationMounts)) {
      if (this.hasService(service)) {
        const path = composePath(mount.source);
        const file = await lstat(path);
        assert.ok(file.isFile() && file.size <= 64 * 1_024, "Invalid fixture configuration file");
        assert.equal(await realpath(path), path, "Fixture configuration cannot traverse symlinks");
      }
    }
    for (const key of [
      "DOCKER_HOST",
      "DOCKER_CONTEXT",
      "DOCKER_CONFIG",
      "DOCKER_TLS_VERIFY",
      "DOCKER_CERT_PATH",
    ]) {
      assert.ok(!process.env[key], "Docker overrides are prohibited for local failure tests");
    }
    const context = await this.docker(["context", "show"]);
    const endpoint = await this.docker([
      "context",
      "inspect",
      context,
      "--format",
      "{{.Endpoints.docker.Host}}",
    ]);
    assert.match(
      endpoint,
      /^(unix:\/\/\/|npipe:\/\/)/,
      "Integration requires a local Docker socket",
    );
    this.endpoint = endpoint;
    assert.equal(await this.docker(["info", "--format", "{{.OSType}}"]), "linux");
    const reserve = async () => {
      const server = createServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      assert.ok(address && typeof address === "object");
      return {
        port: address.port,
        release: async () =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          }),
      };
    };
    const reservations: Array<Awaited<ReturnType<typeof reserve>>> = [];
    try {
      for (const service of this.definition.services) {
        const reservation = await reserve();
        reservations.push(reservation);
        this.ports[service] = reservation.port;
      }
    } finally {
      await Promise.all(reservations.map((reservation) => reservation.release()));
    }
    // Explicit allocated ports survive container stop/start; Docker's port=0 does not.
    // A competing bind fails startup safely instead of killing or reusing another service.
    assert.deepEqual(
      (await this.compose(["config", "--services"])).split(/\s+/).sort(),
      [...this.definition.services].sort(),
    );
    for (const kind of ["container", "network", "volume"] as const) {
      assert.equal((await this.inventory(kind)).length, 0, "Fixture project already exists");
      const nameCollision = await this.docker([
        kind,
        "ls",
        ...(kind === "container" ? ["--all"] : []),
        "--quiet",
        "--filter",
        `name=${kind === "container" ? "^/" : "^"}${this.project}[-_]`,
      ]);
      assert.equal(nameCollision, "", "Fixture name collides with an existing resource");
    }
    this.created = true;
    try {
      await this.compose(["up", "--detach", "--wait", "--wait-timeout", "60"], 120_000);
    } catch (error) {
      for (const container of await this.inventory("container")) {
        const state = record(container.value["State"]);
        const logs = safeDiagnostic(
          await this.docker(["logs", "--tail", "12", container.id]),
          4_096,
        );
        process.stdout.write(
          `${JSON.stringify({
            event: "fixture_start_failed",
            service: container.labels["com.docker.compose.service"],
            status: state["Status"],
            exitCode: state["ExitCode"],
            logs,
          })}\n`,
        );
      }
      throw error;
    }
    assert.equal((await this.inventory("container")).length, this.definition.services.length);
    assert.equal((await this.inventory("network")).length, 1);
    assert.equal((await this.inventory("volume")).length, this.definition.volumes.length);
  }

  private async container(service: FixtureService): Promise<Resource> {
    assert.ok(this.hasService(service), "Service is outside this fixture profile");
    const matching = (await this.inventory("container")).filter(
      (item) => item.labels["com.docker.compose.service"] === service,
    );
    assert.equal(matching.length, 1, "Expected exactly one owned fixture container");
    return matching[0] as Resource;
  }

  async port(service: FixtureService): Promise<number> {
    const container = await this.container(service);
    const ports = record(record(container.value["NetworkSettings"])["Ports"]);
    const bindings: unknown = ports[`${servicePorts[service]}/tcp`];
    assert.ok(Array.isArray(bindings) && bindings.length === 1);
    const binding = record(bindings[0]);
    assert.equal(binding["HostIp"], "127.0.0.1");
    const port = Number(textField(binding["HostPort"]));
    assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
    assert.equal(port, this.ports[service], "Fixture port changed across restart");
    return port;
  }

  async change(
    service: FixtureService,
    action: "stop" | "start" | "pause" | "unpause",
  ): Promise<void> {
    const container = await this.container(service);
    await this.docker(
      ["container", action, ...(action === "stop" ? ["--time", "5"] : []), container.id],
      15_000,
    );
    if (action === "start" || action === "unpause") {
      await eventually(
        `${service} healthy`,
        async () => {
          const current = await this.container(service);
          if (service === "collector") {
            if (record(current.value["State"])["Running"] !== true) {
              return false;
            }
            return httpProbe(await this.port(service), "/v1/metrics", "{}")
              .then((response) => response.status === 200)
              .catch(() => false);
          }
          return record(record(current.value["State"])["Health"])["Status"] === "healthy";
        },
        45_000,
      );
      await this.port(service);
    }
  }

  async sampleResources(): Promise<ReadonlyArray<Record<string, unknown>>> {
    const samples: Array<Record<string, unknown>> = [];
    const dataPaths: Readonly<Record<FixtureService, string | undefined>> = {
      postgres: "/var/lib/postgresql",
      redis: "/data",
      storage: "/data",
      broker: "/var/lib/kafka/data",
      collector: undefined,
      prometheus: "/prometheus",
    };
    for (const service of this.definition.services) {
      const container = await this.container(service);
      const sample = record(
        JSON.parse(
          await this.docker(["stats", "--no-stream", "--format", "{{json .}}", container.id]),
        ) as unknown,
      );
      const imageId = textField(container.value["Image"]);
      assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
      const image = records(await this.docker(["image", "inspect", imageId]))[0];
      assert.ok(image);
      const dataPath = dataPaths[service];
      let dataKiB: number | null = null;
      if (dataPath) {
        const data = await this.docker(["exec", container.id, "du", "-sk", dataPath]);
        dataKiB = Number(data.split(/\s+/)[0]);
        assert.ok(Number.isSafeInteger(dataKiB) && dataKiB >= 0);
      }
      samples.push({
        service,
        cpu: textField(sample["CPUPerc"]),
        memory: textField(sample["MemUsage"]),
        pids: textField(sample["PIDs"]),
        imageBytes: image["Size"],
        architecture: image["Architecture"],
        dataKiB,
      });
    }
    return samples;
  }

  async cleanup(): Promise<void> {
    if (!this.created) {
      return;
    }
    // Validate the whole deletion set before the first mutation. Never compose-down/prune a prefix.
    const containers = await this.inventory("container");
    const networks = await this.inventory("network");
    const volumes = await this.inventory("volume");
    for (const container of containers) {
      assert.ok(Array.isArray(container.value["Mounts"]));
      for (const mount of container.value["Mounts"] as unknown[]) {
        const item = record(mount);
        const service = container.labels["com.docker.compose.service"];
        const allowedBind =
          service === "collector" || service === "prometheus"
            ? configurationMounts[service]
            : undefined;
        assert.ok(
          item["Type"] === "tmpfs" ||
            (item["Type"] === "volume" &&
              this.definition.volumes.some(
                (volume) => item["Name"] === `${this.project}_${volume}`,
              )) ||
            (item["Type"] === "bind" &&
              allowedBind !== undefined &&
              (await configurationSourceMatches(
                item["Source"],
                composePath(allowedBind.source),
                container.labels["desktop.docker.io/wsl-distro"] ===
                  this.environment["WSL_DISTRO_NAME"]
                  ? this.environment["WSL_DISTRO_NAME"]
                  : undefined,
              )) &&
              item["Destination"] === allowedBind.destination &&
              item["RW"] === false &&
              item["Propagation"] === "rprivate"),
          "Unexpected fixture mount",
        );
      }
    }
    for (const network of networks) {
      const attached = Object.keys(record(network.value["Containers"]));
      assert.ok(
        attached.every((id) => containers.some((container) => container.id === id)),
        "Unowned network attachment",
      );
    }
    for (const container of containers) {
      if (record(container.value["State"])["Paused"] === true) {
        await this.docker(["container", "unpause", container.id]);
      }
      await this.docker(["container", "rm", "--force", container.id], 15_000);
    }
    for (const volume of volumes) {
      await this.docker(["volume", "rm", volume.id]);
    }
    for (const network of networks) {
      await this.docker(["network", "rm", network.id]);
    }
    for (const kind of ["container", "network", "volume"] as const) {
      assert.equal((await this.inventory(kind)).length, 0, "Fixture cleanup incomplete");
    }
    this.created = false;
  }
}
