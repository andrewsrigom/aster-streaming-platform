import assert from "node:assert/strict";

const label = "com.aster.media-run";
export const scratchGraceMs = 31 * 60 * 1000;
export function scratchIdentity(project, runId) {
  assert.ok(typeof project === "string" && project.length <= 64);
  assert.match(project, /^aster(?:-[a-z0-9]+)*$/u);
  assert.match(runId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
  return {
    containers: [project + "-media-owner", project + "-media-decoder"],
    volumes: ["input", "output"].map((kind) => project + "_media-decoder-" + kind + "-" + runId),
  };
}
function oldEnough(created, now) {
  const time = Date.parse(created);
  assert.ok(
    Number.isSafeInteger(now) && Number.isFinite(time) && now - time >= scratchGraceMs,
    "Scratch is still inside the job safety window.",
  );
}
export function planScratchCleanup(project, runId, snapshot, now) {
  const expected = scratchIdentity(project, runId);
  assert.ok(Array.isArray(snapshot.containers) && snapshot.containers.length <= 2);
  assert.ok(Array.isArray(snapshot.volumes) && snapshot.volumes.length <= 2);
  const ids = new Set();
  for (const item of snapshot.containers) {
    assert.match(item.Id, /^[a-f0-9]{64}$/u);
    assert.ok(!ids.has(item.Id));
    ids.add(item.Id);
    const index = expected.containers.indexOf(item.Name.slice(1));
    assert.ok(index >= 0);
    assert.equal(item.Config.Labels[label], runId);
    assert.equal(item.Config.Labels["com.docker.compose.project"], project);
    assert.equal(
      item.Config.Labels["com.docker.compose.service"],
      index === 0 ? "media-prepare" : "media-decoder",
    );
    assert.equal(item.State.Running, false, "A media container is active.");
    assert.equal(item.State.Paused, false);
    assert.equal(item.State.Restarting, false);
    assert.ok(["created", "exited", "dead"].includes(item.State.Status));
    oldEnough(item.Created, now);
    assert.ok(Array.isArray(item.Mounts) && item.Mounts.length <= 4);
    for (const mount of item.Mounts) {
      assert.ok(
        mount.Type === "tmpfs" ||
          (mount.Type === "volume" && expected.volumes.includes(mount.Name)),
        "Unexpected media container mount.",
      );
    }
  }
  const names = new Set();
  for (const item of snapshot.volumes) {
    const index = expected.volumes.indexOf(item.Name);
    assert.ok(index >= 0 && !names.has(item.Name));
    names.add(item.Name);
    assert.equal(item.Driver, "local");
    assert.equal(item.Scope, "local");
    assert.equal(item.Labels[label], runId);
    assert.equal(item.Labels["com.docker.compose.project"], project);
    assert.equal(
      item.Labels["com.docker.compose.volume"],
      index === 0 ? "media-decoder-input" : "media-decoder-output",
    );
    assert.equal(item.Labels["com.aster.owner"], "catalog-media");
    assert.equal(item.Labels["com.aster.authority"], "disposable-local");
    assert.deepEqual(item.Options, {
      type: "tmpfs",
      device: "tmpfs",
      o: "size=" + (index === 0 ? "300m" : "520m") + ",uid=1000,gid=1000,mode=0700",
    });
    oldEnough(item.CreatedAt, now);
    assert.ok(Array.isArray(item.consumers) && item.consumers.length <= 2);
    assert.ok(
      item.consumers.every((id) => ids.has(id)),
      "Scratch is referenced by another container.",
    );
  }
  return {
    containers: snapshot.containers.map((item) => ({
      id: item.Id,
      name: item.Name,
      created: item.Created,
    })),
    volumes: snapshot.volumes.map((item) => ({ name: item.Name, created: item.CreatedAt })),
  };
}

// The CLI supplies bounded Docker execution and the real clock; fixtures control both explicitly.
export async function recoverMediaScratch(project, runId, { docker, now, apply, signal, output }) {
  const expected = scratchIdentity(project, runId);
  const ids = (text) => {
    const found = text.trim() ? text.trim().split(/\r?\n/u) : [];
    assert.ok(found.length <= 2);
    return found;
  };
  const inspect = async (kind, targets) => {
    if (targets.length === 0) {
      return [];
    }
    const value = JSON.parse(await docker([kind, "inspect", ...targets]));
    assert.ok(Array.isArray(value) && value.length === targets.length);
    return value;
  };
  const containerIds = ids(
    await docker([
      "container",
      "ls",
      "-a",
      "-q",
      "--no-trunc",
      "--filter",
      "label=" + label + "=" + runId,
    ]),
  );
  const volumeNames = ids(
    await docker(["volume", "ls", "-q", "--filter", "label=" + label + "=" + runId]),
  );
  for (const id of containerIds) {
    assert.match(id, /^[a-f0-9]{64}$/u);
  }
  assert.ok(volumeNames.every((name) => expected.volumes.includes(name)));
  const snapshot = {
    containers: await inspect("container", containerIds),
    volumes: await inspect("volume", volumeNames),
  };
  for (const volume of snapshot.volumes) {
    volume.consumers = ids(
      await docker([
        "container",
        "ls",
        "-a",
        "-q",
        "--no-trunc",
        "--filter",
        "volume=" + volume.Name,
      ]),
    );
  }
  const plan = planScratchCleanup(project, runId, snapshot, now());
  output({ event: "media_scratch_plan", project, runId, apply, ...plan });
  if (!apply) {
    return plan;
  }
  for (const target of plan.containers) {
    signal.throwIfAborted();
    const current = await inspect("container", [target.id]);
    planScratchCleanup(project, runId, { containers: current, volumes: [] }, now());
    assert.equal(current[0].Id, target.id);
    assert.equal(current[0].Created, target.created);
    await docker(["container", "rm", target.id]);
    output({ event: "media_scratch_container_removed", id: target.id });
  }
  for (const target of plan.volumes) {
    signal.throwIfAborted();
    const [current] = await inspect("volume", [target.name]);
    current.consumers = ids(
      await docker([
        "container",
        "ls",
        "-a",
        "-q",
        "--no-trunc",
        "--filter",
        "volume=" + target.name,
      ]),
    );
    planScratchCleanup(project, runId, { containers: [], volumes: [current] }, now());
    assert.equal(current.Name, target.name);
    assert.equal(current.CreatedAt, target.created);
    await docker(["volume", "rm", target.name]);
    output({ event: "media_scratch_volume_removed", name: target.name });
  }
  output({ event: "media_scratch_cleaned", project, runId });
  return plan;
}
