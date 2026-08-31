import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { composeLocalSupergraph, sha256 } from "../src/composition.js";
import { readBoundedFile, verifyArtifacts, writeArtifacts } from "../src/artifacts.js";
import { readGitBaseline } from "../src/baseline.js";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Kind, parse } from "graphql";

const root = new URL("../../../../", import.meta.url);
const sources = {
  catalog: readFileSync(new URL("infra/router/generated/catalog.graphql", root), "utf8"),
  discovery: readFileSync(new URL("infra/router/generated/discovery.graphql", root), "utf8"),
  engagement: readFileSync(new URL("infra/router/generated/engagement.graphql", root), "utf8"),
  identity: readFileSync(new URL("infra/router/generated/identity.graphql", root), "utf8"),
  playback: readFileSync(new URL("infra/router/generated/playback.graphql", root), "utf8"),
};
const operations = readFileSync(new URL("infra/router/known-operations.graphql", root), "utf8");
test("five owner schemas compose deterministically, retain entity ownership and validate all known operations", () => {
  const first = composeLocalSupergraph(sources, operations);
  assert.deepEqual(composeLocalSupergraph(sources, operations), first);
  assert.equal(Object.keys(first).length, 11);
  assert.match(first["supergraph.graphql"] ?? "", /http:\/\/identity:3100\/graphql/u);
  assert.match(first["supergraph.graphql"] ?? "", /http:\/\/catalog:3200\/graphql/u);
  assert.match(first["supergraph.graphql"] ?? "", /http:\/\/playback:3300\/graphql/u);
  assert.match(first["supergraph.graphql"] ?? "", /http:\/\/engagement:3400\/graphql/u);
  assert.match(first["supergraph.graphql"] ?? "", /http:\/\/discovery:3500\/graphql/u);
  assert.match(first["manifest.json"] ?? "", /"type": "Title"/u);
  assert.match(first["manifest.json"] ?? "", /"type": "Profile"/u);
  assert.match(first["manifest.json"] ?? "", /"name": "ViewerAndTitle"/u);
  assert.match(first["manifest.json"] ?? "", /"name": "StartPlayback"/u);
  assert.match(first["manifest.json"] ?? "", /"name": "SearchTitles"/u);
  assert.ok((first["manifest.json"] ?? "").includes(sha256(first["api.graphql"] ?? "")));
  assert.doesNotMatch(
    first["api.graphql"] ?? "",
    /_entities|_service|join__|reviewedBy|sourceChecksum/u,
  );
});

test("every exact trusted operation has one bounded demand profile", () => {
  const artifacts = composeLocalSupergraph(sources, operations);
  const persisted = JSON.parse(artifacts["persisted-query-manifest.json"] ?? "null") as {
    operations: { id: string; name: string; type: string }[];
  };
  const demand = JSON.parse(artifacts["operation-demand-manifest.json"] ?? "null") as {
    format: string;
    version: number;
    policy: Record<string, number>;
    operations: {
      aliases: number;
      authorizationScope: "public" | "account" | "profile";
      cacheControl: string;
      cost: number;
      depth: number;
      executionDeadlineMs: number;
      id: string;
      listExpansion: number;
      maximumConcurrentRequests: number;
      name: string;
      rateClass: string;
      rootFields: number;
      selections: number;
      type: string;
    }[];
  };
  assert.equal(demand.format, "aster-operation-demand-manifest");
  assert.equal(demand.version, 2);
  assert.equal(demand.operations.length, persisted.operations.length);
  assert.deepEqual(
    demand.operations.map(({ id, name, type }) => ({ id, name, type })),
    persisted.operations.map(({ id, name, type }) => ({ id, name, type })),
  );
  for (const profile of demand.operations) {
    assert.ok(profile.cost <= (demand.policy["maximumCost"] ?? 0));
    assert.ok(profile.depth <= (demand.policy["maximumDepth"] ?? 0));
    assert.ok(profile.listExpansion <= (demand.policy["maximumListExpansion"] ?? 0));
    assert.ok(profile.rootFields <= (demand.policy["maximumRootFields"] ?? 0));
    assert.ok(profile.selections <= (demand.policy["maximumSelections"] ?? 0));
    assert.ok(profile.aliases <= (demand.policy["maximumAliases"] ?? 0));
    assert.equal(profile.cacheControl, "no-store");
    assert.equal(profile.executionDeadlineMs, 3_000);
    assert.equal(profile.maximumConcurrentRequests, 8);
  }
  assert.equal(
    demand.operations.find(({ name }) => name === "Browse")?.authorizationScope,
    "public",
  );
  assert.equal(
    demand.operations.find(({ name }) => name === "Viewer")?.authorizationScope,
    "account",
  );
  assert.equal(
    demand.operations.find(({ name }) => name === "TitlesWithEngagement")?.authorizationScope,
    "profile",
  );
  assert.equal(
    demand.operations.find(({ name }) => name === "CreateProfile")?.rateClass,
    "profile_mutation",
  );
  assert.match(artifacts["manifest.json"] ?? "", /operation-demand-manifest\.json/u);
});

test("selected fields on cost-owned entity types require explicit field cost", () => {
  assert.throws(
    () =>
      composeLocalSupergraph(
        {
          ...sources,
          engagement: sources.engagement.replace(
            "progress(profileId: ID!): Progress @cost(weight: 8)",
            "progress(profileId: ID!): Progress",
          ),
        },
        operations,
      ),
    /Title\.progress requires @cost/u,
  );
});

test("every first-party operation has one exact Apollo manifest entry and finite Router matcher", () => {
  const artifacts = composeLocalSupergraph(sources, operations);
  const persisted = JSON.parse(artifacts["persisted-query-manifest.json"] ?? "null") as {
    format: string;
    version: number;
    operations: { body: string; id: string; name: string; type: string }[];
  };
  assert.equal(persisted.format, "apollo-persisted-query-manifest");
  assert.equal(persisted.version, 1);
  assert.equal(persisted.operations.length, 25);
  assert.deepEqual(
    persisted.operations.map(({ name }) => name),
    persisted.operations.map(({ name }) => name).toSorted((a, b) => a.localeCompare(b, "en")),
  );
  const matcher = artifacts["trusted-operations.rhai"] ?? "";
  for (const definition of parse(operations).definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) {
      continue;
    }
    assert.ok(definition.name);
    const entry = persisted.operations.find(({ name }) => name === definition.name?.value);
    assert.ok(entry);
    assert.equal(entry.name, definition.name.value);
    assert.equal(entry.type, definition.operation);
    assert.equal(entry.id, sha256(entry.body));
    assert.match(entry.body, /__typename/u);
    assert.match(matcher, new RegExp(`name == "${definition.name.value}"`, "u"));
    assert.match(matcher, new RegExp(entry.id, "u"));
    assert.notEqual(sha256(entry.body + "\n"), entry.id);
  }
  assert.match(matcher, /fn operation_label\(name\)/u);
  assert.match(matcher, /return "Browse"/u);
  assert.match(matcher, /"other"/u);
  assert.match(matcher, /"unknown"/u);
  assert.doesNotMatch(matcher, /query |mutation |subscription |variables/u);
});

test("a bounded retained wire version supports Router-first client rollout", () => {
  const retainedBody = " \n# obsolete wire\nquery Viewer{me{accountId}}\n ";
  const retained = JSON.stringify({ operations: [{ body: retainedBody }], version: 1 });
  const artifacts = composeLocalSupergraph(sources, operations, undefined, undefined, retained);
  const persisted = JSON.parse(artifacts["persisted-query-manifest.json"] ?? "null") as {
    operations: { body: string; id: string; name: string }[];
  };
  const demand = JSON.parse(artifacts["operation-demand-manifest.json"] ?? "null") as {
    operations: { id: string; name: string }[];
  };
  const schema = JSON.parse(artifacts["manifest.json"] ?? "null") as {
    operations: { name: string; sha256: string }[];
  };
  const viewers = persisted.operations.filter(({ name }) => name === "Viewer");
  assert.equal(viewers.length, 2);
  assert.equal(new Set(viewers.map(({ id }) => id)).size, 2);
  const retainedEntry = viewers.find(({ body }) => body === retainedBody);
  assert.ok(retainedEntry);
  assert.equal(retainedEntry.id, sha256(retainedBody));
  const currentEntry = viewers.find(({ body }) => body !== retainedBody);
  assert.ok(currentEntry);
  assert.deepEqual(
    demand.operations.filter(({ name }) => name === "Viewer").map(({ id }) => id),
    viewers.map(({ id }) => id),
  );
  assert.deepEqual(
    schema.operations.filter(({ name }) => name === "Viewer"),
    [{ name: "Viewer", sha256: currentEntry.id }],
  );
  const matcher = artifacts["trusted-operations.rhai"] ?? "";
  for (const entry of viewers) {
    assert.match(matcher, new RegExp(entry.id, "u"));
  }
  assert.match(matcher, /hash == "[a-f0-9]{64}" \|\| hash == "[a-f0-9]{64}"/u);
  const newOnlyMatcher = composeLocalSupergraph(sources, operations)["trusted-operations.rhai"];
  assert.ok(newOnlyMatcher);
  assert.doesNotMatch(newOnlyMatcher, new RegExp(retainedEntry.id, "u"));
  assert.throws(
    () =>
      composeLocalSupergraph(
        sources,
        operations,
        undefined,
        undefined,
        JSON.stringify({
          operations: [{ body: retainedBody }, { body: retainedBody }],
          version: 1,
        }),
      ),
    /two distinct reviewed bodies/u,
  );
  assert.throws(
    () =>
      composeLocalSupergraph(
        sources,
        operations,
        undefined,
        undefined,
        JSON.stringify({
          operations: [{ body: "query RetainedBroken { missingField }" }],
          version: 1,
        }),
      ),
    /Retained operation incompatible/u,
  );
  assert.throws(
    () => composeLocalSupergraph(sources, operations, undefined, undefined, '{"version":2}'),
    /version 1 and 0–32 exact bodies/u,
  );
});

test("an ownership collision or mismatched type fails composition", () => {
  assert.throws(
    () =>
      composeLocalSupergraph(
        {
          ...sources,
          catalog: sources.catalog.replace("type Query {", "type Query {\n  me: String"),
        },
        operations,
      ),
    /Composition failed/u,
  );
});

test("unknown fields, argument changes, unnamed or duplicate operations fail compatibility", () => {
  assert.throws(
    () => composeLocalSupergraph(sources, "query Broken { missingField }"),
    /Known operation incompatible/u,
  );
  assert.throws(() => composeLocalSupergraph(sources, "{ me { accountId } }"), /named operations/u);
  assert.throws(
    () =>
      composeLocalSupergraph(sources, "query X { me { accountId } } query X { me { expiresAt } }"),
    /Known operation incompatible/u,
  );
  assert.throws(
    () =>
      composeLocalSupergraph(
        {
          ...sources,
          catalog: sources.catalog.replace("title(id: ID!)", "title(id: Int!)"),
        },
        operations,
      ),
    /Known operation incompatible/u,
  );
});

test("a breaking field removal cannot be hidden by removing the corresponding operation", () => {
  const before = composeLocalSupergraph(sources, operations);
  assert.throws(
    () =>
      composeLocalSupergraph(
        {
          ...sources,
          identity: sources.identity.replace("  avatarRef: String @cost(weight: 0)\n", ""),
        },
        "query Viewer { me { accountId } }",
        before["api.graphql"],
      ),
    /Breaking API change/u,
  );
});

test("malformed, empty and excessive source/operation inputs fail before acceptance", () => {
  for (const catalog of ["", "type Invalid {", " ".repeat(131_073)]) {
    assert.throws(() => composeLocalSupergraph({ ...sources, catalog }, operations));
  }
  assert.throws(() => composeLocalSupergraph(sources, ""));
  assert.throws(() => composeLocalSupergraph(sources, " ".repeat(131_073)));
  assert.throws(
    () =>
      composeLocalSupergraph(
        sources,
        Array.from({ length: 33 }, (_, i) => "query Q" + String(i) + " { me { accountId } }").join(
          "\n",
        ),
      ),
    /1–32/u,
  );
});

test("baseline operations remain protected even when current fixtures are rewritten", () => {
  assert.throws(
    () =>
      composeLocalSupergraph(
        {
          ...sources,
          identity: sources.identity.replace("  avatarRef: String @cost(weight: 0)\n", ""),
        },
        "query Viewer { me { accountId } }",
        undefined,
        "query Previous { profiles { profiles { avatarRef } } }",
      ),
    /Baseline operation incompatible/u,
  );
});

test("Git baseline is explicit and the predecessor without supergraph artifacts is a valid bootstrap", async () => {
  assert.equal(
    await readGitBaseline(fileURLToPath(root), "ec6386ca7add0f12ae748589be763d9e90ff0d6c"),
    undefined,
  );
  await assert.rejects(readGitBaseline(fileURLToPath(root), "--all"), /commit SHA/u);
});

test("Git baseline reads the committed API and operations, not modified working files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aster-supergraph-git-"));
  const execute = promisify(execFile);
  const git = async (...args: string[]) =>
    (
      await execute("git", args, {
        cwd: directory,
        encoding: "utf8",
        timeout: 5_000,
        maxBuffer: 16_384,
        windowsHide: true,
      })
    ).stdout.trim();
  const artifactDirectory = join(directory, "infra/router/generated");
  const operationPath = join(directory, "infra/router/known-operations.graphql");
  const artifacts = composeLocalSupergraph(sources, operations);
  try {
    await git("init", "-b", "main", "--quiet");
    await writeArtifacts(artifactDirectory, artifacts);
    await writeFile(operationPath, operations);
    await git("add", "infra");
    await git(
      "-c",
      "user.name=Aster fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "test: record fixture baseline",
    );
    const commit = await git("rev-parse", "HEAD");
    await writeFile(operationPath, "query Rewritten { me { accountId } }");
    const baseline = await readGitBaseline(directory, commit);
    assert.deepEqual(baseline, { commit, api: artifacts["api.graphql"], operations });
    assert.deepEqual(await readGitBaseline(directory), baseline);
    await rm(operationPath);
    await git("add", "infra");
    await git(
      "-c",
      "user.name=Aster fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "test: remove fixture operation contract",
    );
    await assert.rejects(readGitBaseline(directory, await git("rev-parse", "HEAD")), /incomplete/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("artifact checks are read-only, detect missing/stale output and regeneration refuses symlinks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aster-supergraph-test-"));
  const artifacts = composeLocalSupergraph(sources, operations);
  try {
    await assert.rejects(verifyArtifacts(directory, artifacts));
    await writeArtifacts(directory, artifacts);
    await verifyArtifacts(directory, artifacts);
    await writeFile(join(directory, "api.graphql"), "stale");
    await assert.rejects(verifyArtifacts(directory, artifacts), /Stale/u);
    assert.equal(await readBoundedFile(join(directory, "api.graphql")), "stale");
    await writeArtifacts(directory, artifacts);
    await rm(join(directory, "identity.graphql"));
    await symlink(join(directory, "catalog.graphql"), join(directory, "identity.graphql"));
    await assert.rejects(writeArtifacts(directory, artifacts), /regular/u);
    await assert.rejects(readBoundedFile(join(directory, "catalog.graphql"), 10), /bounded/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
