import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { clearTimeout, setTimeout } from "node:timers";

const repositoryRoot = resolve(import.meta.dirname, "..");
const resetPath = resolve(repositoryRoot, "tools", "reset-local-platform.sh");
const composePath = resolve(repositoryRoot, "infra", "compose", "compose.yml");
const confirmationArguments = ["--confirm", "DELETE-ASTER-LOCAL-DATA"];
const shellExecutable = process.platform === "win32" ? "sh" : "/bin/sh";
const resetFixtureTimeoutMs = process.platform === "win32" ? 15_000 : 5_000;
const blockedEnvironmentNames = [
  "ASTER_DATABASE_URL",
  "ASTER_REDIS_URL",
  "BUILDKITE",
  "CI",
  "CIRCLECI",
  "DATABASE_URL",
  "DOCKER_CERT_PATH",
  "DOCKER_CONFIG",
  "DOCKER_CONTEXT",
  "DOCKER_HOST",
  "DOCKER_TLS_VERIFY",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "JENKINS_URL",
  "POSTGRESQL_URL",
  "POSTGRES_URL",
  "REDIS_URL",
  "TF_BUILD",
];

const fakeDockerSource = `#!/bin/sh
set -eu

printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"

if [ "$1" = "context" ] && [ "$2" = "show" ]; then
  printf '%s\\n' default
  exit 0
fi
if [ "$1" = "context" ] && [ "$2" = "inspect" ]; then
  printf '%s\\n' "$FAKE_DOCKER_ENDPOINT"
  exit 0
fi

if [ "$1" = "--context" ]; then
  [ "$2" = "default" ] || exit 90
  shift 2
fi

if [ "$1" = "info" ]; then
  printf '%s\\n' linux
  exit 0
fi

if [ "$1" = "compose" ]; then
  shift
  [ "$1" = "--project-name" ] && [ "$2" = "aster" ] || exit 91
  shift 2
  [ "$1" = "--file" ] && [ "$2" = "$FAKE_COMPOSE_FILE" ] || exit 92
  shift 2
  [ "$1" = "--profile" ] && [ "$2" = "*" ] || exit 95
  shift 2
  if [ "$1" = "config" ] && [ "$2" = "--quiet" ]; then
    exit 0
  fi
  if [ "$1" = "config" ] && [ "$2" = "--services" ]; then
    printf '%s\\n' redis postgres platform-init platform-status identity
    if [ "$FAKE_DOCKER_SCENARIO" = "unexpected-service" ]; then
      printf '%s\\n' unreviewed
    fi
    exit 0
  fi
  if [ "$1" = "config" ] && [ "$2" = "--volumes" ]; then
    printf '%s\\n' postgres-data
    exit 0
  fi
  if [ "$1" = "down" ] && [ "$2" = "--volumes" ]; then
    if [ "$FAKE_DOCKER_SCENARIO" = "compose-failure" ]; then
      exit 42
    fi
    : > "$FAKE_DOCKER_STATE/down"
    exit 0
  fi
  exit 93
fi

resource_present=false
if [ "$FAKE_DOCKER_SCENARIO" != "empty" ]; then
  if [ ! -f "$FAKE_DOCKER_STATE/down" ] || [ "$FAKE_DOCKER_SCENARIO" = "postcondition-failure" ]; then
    resource_present=true
  fi
fi

if [ "$1" = "container" ] && [ "$2" = "ls" ]; then
  case "$*" in
    *'volume='*)
      if [ "$FAKE_DOCKER_SCENARIO" = "foreign-volume" ] || [ "$FAKE_DOCKER_SCENARIO" = "foreign-legacy-volume" ]; then
        printf '%s\\n' foreign-id
      fi
      exit 0
      ;;
  esac
  if [ "$resource_present" = true ]; then
    printf '%s\\n' container-id
    if [ "$FAKE_DOCKER_SCENARIO" = "duplicate-identity" ]; then
      printf '%s\\n' second-container-id
    fi
  fi
  exit 0
fi
if [ "$1" = "container" ] && [ "$2" = "inspect" ]; then
  case "$4" in
    *'.Mounts'*)
      case "$FAKE_DOCKER_SCENARIO" in
        foreign-mount) printf '%s\\n' 'bind||/private' ;;
        runtime | legacy-identity | duplicate-identity) ;;
        legacy-helper | foreign-legacy-volume) printf '%s\\n' 'volume|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|/var/lib/postgresql' ;;
        *) printf '%s\\n' 'volume|aster_postgres-data|/var/lib/postgresql' ;;
      esac
      exit 0
      ;;
    *'.NetworkSettings.Networks'*)
      if [ "$FAKE_DOCKER_SCENARIO" = "foreign-attachment" ]; then
        printf '%s\\n' foreign-network
      elif [ "$FAKE_DOCKER_SCENARIO" = "runtime" ]; then
        printf '%s\\n' aster_edge aster_platform
      else
        printf '%s\\n' aster_platform
      fi
      exit 0
      ;;
  esac
  if [ "$4" = "{{.Name}}" ]; then
    printf '%s\\n' /aster-postgres-1
  elif [ "$4" = "{{ index .Config.Labels \\"com.docker.compose.project\\" }}" ]; then
    printf '%s\\n' aster
  elif [ "$FAKE_DOCKER_SCENARIO" = "label-mismatch" ]; then
    printf 'aster|postgres|local||%s\\n' "$FAKE_COMPOSE_FILE"
  elif [ "$FAKE_DOCKER_SCENARIO" = "previous-revision" ]; then
    printf 'aster|postgres|||%s\\n' "$FAKE_COMPOSE_FILE"
  elif [ "$FAKE_DOCKER_SCENARIO" = "legacy-identity" ]; then
    printf 'aster|identity|||%s\\n' "$FAKE_COMPOSE_FILE"
  elif [ "$FAKE_DOCKER_SCENARIO" = "legacy-helper" ] || [ "$FAKE_DOCKER_SCENARIO" = "foreign-legacy-volume" ]; then
    printf 'aster|platform-init|||%s\\n' "$FAKE_COMPOSE_FILE"
  elif [ "$FAKE_DOCKER_SCENARIO" = "runtime" ] || [ "$FAKE_DOCKER_SCENARIO" = "duplicate-identity" ]; then
    printf 'aster|identity|local|platform|%s\\n' "$FAKE_COMPOSE_FILE"
  else
    printf 'aster|postgres|local|platform|%s\\n' "$FAKE_COMPOSE_FILE"
  fi
  exit 0
fi
if [ "$1" = "network" ] && [ "$2" = "ls" ]; then
  if [ "$resource_present" = true ]; then
    printf '%s\\n' network-id
    if [ "$FAKE_DOCKER_SCENARIO" = "runtime" ]; then
      printf '%s\\n' edge-network-id
    fi
  fi
  exit 0
fi
if [ "$1" = "network" ] && [ "$2" = "inspect" ]; then
  case "$4" in
    *'.Containers'*)
      if [ "$FAKE_DOCKER_SCENARIO" = "foreign-network" ]; then
        printf '%s\\n' foreign-id
      else
        printf '%s\\n' container-id
      fi
      exit 0
      ;;
  esac
  if [ "$4" = "{{.Name}}" ]; then
    if [ "$5" = "edge-network-id" ]; then
      printf '%s\\n' aster_edge
    else
      printf '%s\\n' aster_platform
    fi
  elif [ "$4" = "{{ index .Labels \\"com.docker.compose.project\\" }}" ]; then
    printf '%s\\n' aster
  else
    if [ "$5" = "edge-network-id" ]; then
      printf '%s\\n' 'aster|edge|local|platform'
    else
      printf '%s\\n' 'aster|platform|local|platform'
    fi
  fi
  exit 0
fi
if [ "$1" = "volume" ] && [ "$2" = "ls" ]; then
  if [ "$resource_present" = true ]; then
    if [ "$FAKE_DOCKER_SCENARIO" != "missing-project-label" ] || printf '%s' "$*" | grep -q 'name='; then
      printf '%s\\n' aster_postgres-data
    fi
  fi
  exit 0
fi
if [ "$1" = "volume" ] && [ "$2" = "inspect" ]; then
  if [ "$resource_present" = false ]; then
    exit 1
  fi
  if [ "$4" = "{{json .Labels}}" ]; then
    printf '%s\\n' '{"com.docker.volume.anonymous":""}'
    exit 0
  fi
  if [ "$4" = "{{ index .Labels \\"com.docker.compose.project\\" }}" ]; then
    if [ "$FAKE_DOCKER_SCENARIO" = "missing-project-label" ]; then
      printf '%s\\n' foreign-project
    else
      printf '%s\\n' aster
    fi
  else
    printf '%s\\n' 'aster|postgres-data|durable-local|local|platform'
  fi
  exit 0
fi

exit 94
`;

function shellPath(path) {
  if (process.platform !== "win32") {
    return path;
  }
  return path
    .replace(/^([A-Za-z]):/u, (_match, drive) => `/${drive.toLowerCase()}`)
    .replaceAll("\\", "/");
}

async function runReset(t, options = {}) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "aster-reset-test-"));
  t.after(async () => rm(fixtureRoot, { force: true, recursive: true }));
  const binDirectory = join(fixtureRoot, "bin");
  const stateDirectory = join(fixtureRoot, "state");
  const logPath = join(fixtureRoot, "docker.log");
  await mkdir(binDirectory);
  await mkdir(stateDirectory);
  const dockerPath = join(binDirectory, "docker");
  await writeFile(dockerPath, fakeDockerSource, "utf8");
  await chmod(dockerPath, 0o755);

  const environment = { ...process.env };
  const inheritedPath = Object.entries(environment).find(
    ([name]) => name.toLowerCase() === "path",
  )?.[1];
  for (const name of Object.keys(environment)) {
    if (name.toLowerCase() === "path") {
      delete environment[name];
    }
  }
  for (const name of blockedEnvironmentNames) {
    delete environment[name];
  }
  Object.assign(environment, {
    ASTER_ENVIRONMENT: "local",
    FAKE_COMPOSE_FILE: shellPath(composePath),
    FAKE_DOCKER_ENDPOINT: "unix:///var/run/docker.sock",
    FAKE_DOCKER_LOG: shellPath(logPath),
    FAKE_DOCKER_SCENARIO: options.scenario ?? "populated",
    FAKE_DOCKER_STATE: shellPath(stateDirectory),
    PATH: [binDirectory, inheritedPath ?? "/usr/bin:/bin"].join(delimiter),
    ...options.environment,
  });
  for (const name of options.unsetEnvironment ?? []) {
    delete environment[name];
  }

  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(
      shellExecutable,
      [shellPath(resetPath), ...(options.arguments ?? confirmationArguments)],
      {
        cwd: repositoryRoot,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`reset fixture exceeded ${resetFixtureTimeoutMs} milliseconds`));
    }, resetFixtureTimeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolveResult({ code, signal, stderr, stdout });
    });
  });
  const log = await readFile(logPath, "utf8").catch(() => "");
  return { ...result, log };
}

test("refuses missing local intent or an incorrect confirmation before Docker", async (t) => {
  const missingEnvironment = await runReset(t, { unsetEnvironment: ["ASTER_ENVIRONMENT"] });
  assert.equal(missingEnvironment.code, 1);
  assert.match(missingEnvironment.stderr, /ASTER_ENVIRONMENT=local/u);
  assert.equal(missingEnvironment.log, "");

  const incorrectConfirmation = await runReset(t, {
    arguments: ["--confirm", "delete-everything"],
  });
  assert.equal(incorrectConfirmation.code, 1);
  assert.match(incorrectConfirmation.stderr, /DELETE-ASTER-LOCAL-DATA/u);
  assert.equal(incorrectConfirmation.log, "");
});

test("refuses extra targets, hosted URLs, CI, and Docker overrides before Docker", async (t) => {
  for (const options of [
    { arguments: [...confirmationArguments, "https://database.example"] },
    { environment: { DATABASE_URL: "postgresql://hosted.example/aster" } },
    { environment: { CI: "true" } },
    { environment: { DOCKER_HOST: "tcp://remote.example:2376" } },
  ]) {
    const result = await runReset(t, options);
    assert.equal(result.code, 1);
    assert.equal(result.log, "");
  }
});

test("refuses a remote active Docker endpoint before Compose", async (t) => {
  const result = await runReset(t, {
    environment: { FAKE_DOCKER_ENDPOINT: "ssh://operator@remote.example" },
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /not a local socket/u);
  assert.doesNotMatch(result.log, / compose /u);
});

test("refuses unexpected resource labels without teardown", async (t) => {
  const result = await runReset(t, { scenario: "label-mismatch" });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /incomplete or unexpected environment and scope label pair/u);
  assert.doesNotMatch(result.log, / down --volumes/u);

  const missingProjectLabel = await runReset(t, { scenario: "missing-project-label" });
  assert.equal(missingProjectLabel.code, 1);
  assert.match(missingProjectLabel.stderr, /Aster name prefix without exact project ownership/u);
  assert.doesNotMatch(missingProjectLabel.log, / down --volumes/u);
});

test("removes only the fixed populated Aster project and proves postconditions", async (t) => {
  const result = await runReset(t);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /reset complete/u);
  assert.match(result.stdout, /containers=1 networks=1 volumes=1/u);
  assert.match(
    result.log,
    new RegExp(
      `--context default compose --project-name aster --file ${shellPath(composePath).replaceAll("/", "\\/")} --profile \\* down --volumes`,
      "u",
    ),
  );
  assert.doesNotMatch(result.log, /prune|--remove-orphans|--rmi/u);

  const previousRevision = await runReset(t, { scenario: "previous-revision" });
  assert.equal(previousRevision.code, 0);
  assert.match(previousRevision.stdout, /reset complete/u);
  assert.match(previousRevision.stdout, /containers=1 networks=1 volumes=1/u);
});

test("is idempotent when Aster has no local resources", async (t) => {
  const result = await runReset(t, { scenario: "empty" });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /already reset/u);
  assert.doesNotMatch(result.log, / down --volumes/u);
});

test("reports Compose failure without a broad fallback", async (t) => {
  const result = await runReset(t, { scenario: "compose-failure" });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /no broad fallback cleanup was attempted/u);
  assert.doesNotMatch(result.log, /prune|--remove-orphans|--rmi/u);
});

test("fails when any project resource remains after teardown", async (t) => {
  const result = await runReset(t, { scenario: "postcondition-failure" });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /containers=1 networks=1 volumes=1/u);
});

test("accepts a partial runtime profile and tears down all reviewed profiles", async (t) => {
  const result = await runReset(t, { scenario: "runtime" });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.log, /--profile \* down --volumes/u);
  assert.match(result.stdout, /networks=2/u);
});

test("removes only validated legacy helper anonymous volumes and verifies their absence", async (t) => {
  const result = await runReset(t, { scenario: "legacy-helper" });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /legacy helper volumes=1/u);
});

test("refuses unreviewed profiles, Identity ownership, mounts and shared resources before deletion", async (t) => {
  for (const scenario of [
    "unexpected-service",
    "legacy-identity",
    "duplicate-identity",
    "foreign-mount",
    "foreign-attachment",
    "foreign-network",
    "foreign-volume",
    "foreign-legacy-volume",
  ]) {
    const result = await runReset(t, { scenario });
    assert.equal(result.code, 1, scenario);
    assert.doesNotMatch(result.log, / down --volumes/u, scenario);
  }
});
