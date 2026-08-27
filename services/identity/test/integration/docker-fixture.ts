import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { devNull } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const composeFile = fileURLToPath(
  new URL("../../../../../infra/compose/integration.yml", import.meta.url),
);
const scope = "p01-r09";
export type CoreService = "postgres" | "redis";
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
  return result.stdout.trim();
};

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

export class CoreDockerFixture {
  constructor(private readonly command: DockerCommand = runDocker) {}

  readonly project = `aster-integration-${randomUUID().replaceAll("-", "")}`;
  private endpoint: string | undefined;
  private created = false;
  private ports: Readonly<{ postgres: number; redis: number }> | undefined;
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
          ASTER_INTEGRATION_POSTGRES_PORT: String(this.ports?.postgres ?? ""),
          ASTER_INTEGRATION_REDIS_PORT: String(this.ports?.redis ?? ""),
        },
        timeout,
      );
    } catch {
      // Docker errors can echo connection settings. Keep the failing operation, not its arguments.
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
        "--file",
        composeFile,
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
    assert.ok(identifiers.length <= (kind === "container" ? 2 : 1), "Unexpected fixture inventory");
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
        assert.ok(service === "postgres" || service === "redis", "Unowned fixture service");
        assert.equal(name, `${this.project}-${service}-1`);
        assert.equal(labels["com.docker.compose.project.config_files"], composeFile);
      } else if (kind === "network") {
        assert.equal(labels["com.docker.compose.network"], "platform");
        assert.equal(name, `${this.project}_platform`);
      } else {
        assert.equal(labels["com.docker.compose.volume"], "postgres-data");
        assert.equal(labels["com.aster.authority"], "disposable-fixture");
        assert.equal(labels["com.aster.owner"], "integration");
        assert.equal(name, `${this.project}_postgres-data`);
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
    const postgres = await reserve();
    try {
      const redis = await reserve();
      try {
        this.ports = { postgres: postgres.port, redis: redis.port };
      } finally {
        await redis.release();
      }
    } finally {
      await postgres.release();
    }
    // Explicit allocated ports survive container stop/start; Docker's port=0 does not.
    // A competing bind fails startup safely instead of killing or reusing another service.
    assert.deepEqual((await this.compose(["config", "--services"])).split(/\s+/).sort(), [
      "postgres",
      "redis",
    ]);
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
    await this.compose(["up", "--detach", "--wait", "--wait-timeout", "60"], 120_000);
    assert.equal((await this.inventory("container")).length, 2);
    assert.equal((await this.inventory("network")).length, 1);
    assert.equal((await this.inventory("volume")).length, 1);
  }

  private async container(service: CoreService): Promise<Resource> {
    const matching = (await this.inventory("container")).filter(
      (item) => item.labels["com.docker.compose.service"] === service,
    );
    assert.equal(matching.length, 1, "Expected exactly one owned fixture container");
    return matching[0] as Resource;
  }

  async port(service: CoreService): Promise<number> {
    const container = await this.container(service);
    const ports = record(record(container.value["NetworkSettings"])["Ports"]);
    const bindings: unknown = ports[service === "postgres" ? "5432/tcp" : "6379/tcp"];
    assert.ok(Array.isArray(bindings) && bindings.length === 1);
    const binding = record(bindings[0]);
    assert.equal(binding["HostIp"], "127.0.0.1");
    const port = Number(textField(binding["HostPort"]));
    assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
    assert.equal(port, this.ports?.[service], "Fixture port changed across restart");
    return port;
  }

  async change(
    service: CoreService,
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
          return record(record(current.value["State"])["Health"])["Status"] === "healthy";
        },
        45_000,
      );
      await this.port(service);
    }
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
        assert.ok(
          item["Type"] === "tmpfs" ||
            (item["Type"] === "volume" && item["Name"] === `${this.project}_postgres-data`),
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
