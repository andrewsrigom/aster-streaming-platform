import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import test from "node:test";
import {
  planScratchCleanup,
  recoverMediaScratch,
  scratchIdentity,
  scratchGraceMs,
} from "./scratch-cleanup.mjs";

const project = "aster-cleanup-test";
const runId = "00000000-0000-4000-8000-000000000001";
const created = "2026-08-28T00:00:00.000Z";
const now = Date.parse(created) + scratchGraceMs;
const expected = scratchIdentity(project, runId);
function fixture() {
  const containers = expected.containers.map((name, index) => ({
    Id: String(index + 1).repeat(64),
    Name: "/" + name,
    Created: created,
    Config: {
      Labels: {
        "com.aster.media-run": runId,
        "com.docker.compose.project": project,
        "com.docker.compose.service": index === 0 ? "media-prepare" : "media-decoder",
      },
    },
    State: { Running: false, Paused: false, Restarting: false, Status: "exited" },
    Mounts: expected.volumes.map((Name) => ({ Type: "volume", Name })),
  }));
  const volumes = expected.volumes.map((Name, index) => ({
    Name,
    CreatedAt: created,
    Driver: "local",
    Scope: "local",
    Labels: {
      "com.aster.media-run": runId,
      "com.docker.compose.project": project,
      "com.docker.compose.volume": index === 0 ? "media-decoder-input" : "media-decoder-output",
      "com.aster.owner": "catalog-media",
      "com.aster.authority": "disposable-local",
    },
    Options: {
      type: "tmpfs",
      device: "tmpfs",
      o: "size=" + (index === 0 ? "300m" : "520m") + ",uid=1000,gid=1000,mode=0700",
    },
    consumers: containers.map((item) => item.Id),
  }));
  return { containers, volumes };
}
test("scratch cleanup only plans expired run-specific disposable resources", () => {
  const f = fixture();
  assert.equal(planScratchCleanup(project, runId, f, now).volumes.length, 2);
  assert.throws(() => planScratchCleanup(project, runId, f, now - 1));
  assert.deepEqual(planScratchCleanup(project, runId, { containers: [], volumes: [] }, now), {
    containers: [],
    volumes: [],
  });
  for (const change of [
    (v) => {
      v.containers[0].State.Running = true;
    },
    (v) => {
      v.containers[0].State.Restarting = true;
    },
    (v) => {
      v.containers[0].Config.Labels["com.docker.compose.project"] = "other";
    },
    (v) => {
      v.containers[0].Mounts = [{ Type: "bind", Source: "/" }];
    },
    (v) => {
      v.containers[0].Name = "/aster-database";
    },
    (v) => {
      v.volumes[0].Name = project + "_media-decoder-input";
    },
    (v) => {
      v.volumes[0].Name = project + "_storage-data";
    },
    (v) => {
      v.volumes[0].Labels["com.aster.media-run"] = "other";
    },
    (v) => {
      v.volumes[0].Options.type = "none";
    },
    (v) => {
      v.volumes[0].Options.o = "bind";
    },
    (v) => {
      v.volumes[0].consumers.push("9".repeat(64));
    },
    (v) => {
      v.volumes[0].CreatedAt = "not-a-date";
    },
    (v) => {
      v.containers.push(v.containers[0]);
    },
    (v) => {
      v.volumes.push(v.volumes[0]);
    },
  ]) {
    const bad = fixture();
    change(bad);
    assert.throws(() => planScratchCleanup(project, runId, bad, now));
  }
});
function fakeDocker(state) {
  const calls = [];
  const docker = async (args) => {
    calls.push(args);
    const [kind, operation, ...rest] = args;
    const items = kind === "container" ? state.containers : state.volumes;
    if (operation === "ls") {
      const filter = args.at(-1);
      if (filter.startsWith("volume=")) {
        return state.containers
          .filter((item) => item.Mounts.some((mount) => mount.Name === filter.slice(7)))
          .map((item) => item.Id)
          .join("\n");
      }
      return items.map((item) => (kind === "container" ? item.Id : item.Name)).join("\n");
    }
    if (operation === "inspect") {
      return JSON.stringify(
        items.filter((item) => rest.includes(kind === "container" ? item.Id : item.Name)),
      );
    }
    assert.equal(operation, "rm");
    assert.equal(rest.length, 1);
    assert.ok(!rest[0].startsWith("-"));
    const index = items.findIndex(
      (item) => rest[0] === (kind === "container" ? item.Id : item.Name),
    );
    assert.ok(index >= 0);
    items.splice(index, 1);
    return rest[0];
  };
  return { docker, calls };
}
test("cleanup dry run is read-only; apply removes containers before only their volumes and replays empty", async () => {
  const state = fixture();
  const f = fakeDocker(state);
  const options = {
    ...f,
    now: () => now,
    signal: new globalThis.AbortController().signal,
    output: () => undefined,
  };
  await recoverMediaScratch(project, runId, { ...options, apply: false });
  assert.ok(f.calls.every((call) => call[1] !== "rm"));
  await recoverMediaScratch(project, runId, { ...options, apply: true });
  assert.deepEqual(
    f.calls.filter((call) => call[1] === "rm").map((call) => call[0]),
    ["container", "container", "volume", "volume"],
  );
  assert.deepEqual(state, { containers: [], volumes: [] });
  await recoverMediaScratch(project, runId, { ...options, apply: true });
});
test("changed ownership/activity and cancellation fail closed; partial cleanup can resume", async () => {
  for (const change of ["running", "cancel", "foreign-volume-consumer"]) {
    const state = fixture();
    const f = fakeDocker(state);
    const controller = new globalThis.AbortController();
    let planned = false;
    const output = (item) => {
      if (item.event === "media_scratch_plan" && !planned) {
        planned = true;
        if (change === "running") {
          state.containers[0].State.Running = true;
        }
        if (change === "cancel") {
          controller.abort();
        }
      }
    };
    const docker = async (args) => {
      if (
        change === "foreign-volume-consumer" &&
        state.containers.length === 0 &&
        args[1] === "ls" &&
        args.at(-1).startsWith("volume=")
      ) {
        return "9".repeat(64);
      }
      return f.docker(args);
    };
    await assert.rejects(
      recoverMediaScratch(project, runId, {
        docker,
        now: () => now,
        apply: true,
        signal: controller.signal,
        output,
      }),
    );
    assert.ok(f.calls.every((call) => call[0] !== "volume" || call[1] !== "rm"));
  }
  const state = fixture();
  const f = fakeDocker(state);
  let injected = false;
  const options = {
    now: () => now,
    apply: true,
    signal: new globalThis.AbortController().signal,
    output: () => undefined,
  };
  await assert.rejects(
    recoverMediaScratch(project, runId, {
      ...options,
      docker: async (args) => {
        if (args[1] === "rm" && !injected) {
          injected = true;
          await f.docker(args);
          throw new Error("Synthetic interruption after removal");
        }
        return f.docker(args);
      },
    }),
  );
  await recoverMediaScratch(project, runId, { ...options, docker: f.docker });
  assert.deepEqual(state, { containers: [], volumes: [] });
});
test("cleanup CLI rejects unsafe targets and remote overrides before Docker", async () => {
  const execute = promisify(execFile);
  const tool = fileURLToPath(new URL("../clean-media-scratch.mjs", import.meta.url));
  for (const [args, extra] of [
    [["production", runId], {}],
    [[project, "../escape"], {}],
    [[project, runId, "--force"], {}],
    [[project, runId, "--apply", "extra"], {}],
    [[project, runId], { DOCKER_HOST: "ssh://remote.invalid" }],
    [[project, runId], { DOCKER_CONTEXT: "remote" }],
    [[project, runId], { DOCKER_TLS_VERIFY: "1" }],
    [[project, runId], { CI: "true" }],
  ]) {
    await assert.rejects(
      execute(process.execPath, [tool, ...args], {
        timeout: 3000,
        env: { ...process.env, PATH: "/no-docker-here", ...extra },
      }),
      (error) => {
        assert.equal(error.code, 1);
        assert.deepEqual(JSON.parse(error.stdout), {
          event: "media_scratch_rejected",
          code: "UNSAFE_OR_UNAVAILABLE",
        });
        assert.equal(error.stderr, "");
        return true;
      },
    );
  }
});
test("candidate Compose names use the run UUID without changing the source/decoder mount paths", async () => {
  const source = await readFile(new URL("../../infra/compose/media.yml", import.meta.url), "utf8");
  for (const kind of ["input", "output"]) {
    assert.ok(
      source.includes(
        "name: ${COMPOSE_PROJECT_NAME}_media-decoder-" + kind + "${ASTER_MEDIA_RUN_SUFFIX:-}",
      ),
    );
  }
  const runner = await readFile(new URL("../run-media-candidate.mjs", import.meta.url), "utf8");
  assert.ok(runner.includes('env: { ...process.env, ASTER_MEDIA_RUN_SUFFIX: "-" + runId }'));
  assert.ok(runner.includes('project + "_media-decoder-input-" + runId'));
  assert.ok(runner.includes('project + "_media-decoder-output-" + runId'));
});
