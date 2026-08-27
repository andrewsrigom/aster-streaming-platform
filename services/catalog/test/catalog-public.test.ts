import assert from "node:assert/strict";
import { test } from "node:test";
import { createCatalogPublicQueries } from "../src/application/public-queries.js";
import { normalizeCatalogCommand } from "../src/application/command-input.js";
import { normalizeTitleMetadata } from "../src/domain/metadata.js";
import { projectPublicTitle } from "../src/domain/public-title.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";
import { hash, metadataFixture, rightsFacts, workflowFixture } from "./workflow-fixture.js";
import { publicCandidate, publicFixture } from "./public-fixture.js";
const signal = () => new AbortController().signal;
const policy = { commercial: true };

test("pre-extension command receipts replay without rewriting audit or ignoring newly supplied metadata", async () => {
  const f = workflowFixture();
  const full = metadataFixture();
  const metadata = {
    defaultLocale: full.defaultLocale,
    localizations: full.localizations,
    genres: full.genres,
    credits: full.credits,
    artwork: null,
  };
  const input = {
    titleId: id(1),
    mutationId: id(8),
    expectedVersion: 0,
    metadata,
    rights: rightsFacts(),
  };
  const created = await f.commands.execute("create", input, f.request);
  assert.equal(created.status, "completed");
  const normalized = normalizeCatalogCommand("create", input);
  assert.ok(normalized);
  const receipt = f.state().receipts[0];
  assert.ok(receipt);
  f.state().receipts[0] = { ...receipt, digest: hash(JSON.stringify({ ...normalized, metadata })) };
  const count = f.state().audits.length;
  assert.deepEqual(await f.commands.execute("create", input, f.request), created);
  assert.equal(f.state().audits.length, count);
  assert.equal(
    (
      await f.commands.execute(
        "create",
        { ...input, metadata: { ...full, releaseYear: 2026 } },
        f.request,
      )
    ).status,
    "conflict",
  );
});

test("public metadata extends legacy snapshots without inventing facts and enforces every collection bound", () => {
  const legacy = {
    defaultLocale: "en",
    localizations: metadataFixture().localizations,
    genres: [],
    credits: [],
    artwork: null,
  };
  assert.deepEqual(normalizeTitleMetadata(legacy), {
    ...metadataFixture(),
    genres: [],
    credits: [],
  });
  const metadata = normalizeTitleMetadata({
    ...metadataFixture(),
    releaseYear: 2026,
    runtimeSeconds: 120,
    languages: ["pt-br", "en"],
    accessibility: ["TRANSCRIPT", "CAPTIONS"],
    editorialLabels: ["short-film", "featured"],
  });
  assert.ok(metadata);
  assert.deepEqual(metadata.languages, ["en", "pt-BR"]);
  assert.deepEqual(metadata.accessibility, ["CAPTIONS", "TRANSCRIPT"]);
  assert.deepEqual(metadata.editorialLabels, ["featured", "short-film"]);
  for (const patch of [
    { releaseYear: 1887 },
    { releaseYear: 10000 },
    { releaseYear: 2026.1 },
    { runtimeSeconds: 0 },
    { runtimeSeconds: 86401 },
    { runtimeSeconds: "120" },
    { languages: ["en", "EN"] },
    { languages: Array.from({ length: 9 }, () => "en") },
    { accessibility: ["CAPTIONS", "CAPTIONS"] },
    { accessibility: ["UNKNOWN"] },
    { editorialLabels: ["Needs Review"] },
    { editorialLabels: Array.from({ length: 9 }, (_, n) => "label-" + String(n)) },
    { extra: true },
  ]) {
    assert.equal(
      normalizeTitleMetadata({ ...metadataFixture(), ...patch }),
      undefined,
      JSON.stringify(patch),
    );
  }
});

test("public projection derives attribution and excludes operator facts and all delivery credentials", () => {
  const candidate = publicCandidate();
  const title = projectPublicTitle(candidate, now, policy);
  assert.ok(title);
  assert.equal(title.attribution.creator, "Synthetic creator");
  assert.doesNotMatch(
    JSON.stringify(title),
    /reviewedBy|evidenceLocations|sourceChecksum|assetSourceUrl|manifestUrl|publicationId|rightsRevision/u,
  );
  for (const patch of [
    { latestRightsRevision: 3 },
    { title: { ...(candidate.title as object), state: "RETIRED" } },
    { title: { ...(candidate.title as object), state: "DRAFT", publicationId: null } },
    { rights: { ...(candidate.rights as object), status: "DISPUTED" } },
    { rights: { ...(candidate.rights as object), validUntil: now } },
    { publication: { ...(candidate.publication as object), titleId: id(99) } },
    {
      metadata: {
        ...metadataFixture(),
        artwork: {
          url: "https://example.invalid/art.png",
          altText: "Artwork",
          rights: candidate.rights,
        },
      },
    },
  ]) {
    assert.equal(projectPublicTitle({ ...candidate, ...patch }, now, policy), undefined);
  }
});

test("public browse uses exact positive keysets, lookahead and deterministic locale fallback", async () => {
  const f = publicFixture();
  const page = await f.queries.browse({ first: 2, after: null }, signal());
  assert.equal(page.status, "completed");
  assert.deepEqual(
    page.value.edges.map((edge) => edge.node.id),
    [id(1), id(2)],
  );
  assert.equal(page.value.pageInfo.hasNextPage, true);
  f.state.candidates.shift();
  const second = await f.queries.browse(
    { first: 2, after: page.value.pageInfo.endCursor },
    signal(),
  );
  assert.equal(second.status, "completed");
  assert.deepEqual(
    second.value.edges.map((edge) => edge.node.id),
    [id(3)],
  );
  assert.equal(second.value.pageInfo.hasNextPage, false);
  const empty = await f.queries.browse(
    { first: 2, after: second.value.pageInfo.endCursor },
    signal(),
  );
  assert.deepEqual(empty, {
    status: "completed",
    value: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } },
  });
  const title = page.value.edges[0]?.node;
  assert.ok(title);
  assert.equal(f.queries.localized(title, "pt-BR").status, "completed");
  assert.deepEqual(f.queries.localized(title, "invalid locale"), { status: "invalid_input" });
});

test("invalid pages and entity inputs reject before SQL; batches preserve duplicate order and explicit nulls", async () => {
  const f = publicFixture();
  for (const input of [
    { first: 0, after: null },
    { first: 21, after: null },
    { first: 1.5, after: null },
    { first: 1, after: "c2." + id(1) },
    { first: 1, after: "c1." + id(1) + " " },
    { first: 1, after: "" },
    { first: 1, after: 7 },
    { first: 1 },
    { first: 1, after: null, extra: true },
  ]) {
    assert.equal((await f.queries.browse(input, signal())).status, "invalid_input");
  }
  assert.equal((await f.queries.byIds(["invalid"], signal())).status, "invalid_input");
  assert.equal((await f.queries.byIds(new Array<unknown>(2), signal())).status, "invalid_input");
  const accessor = [id(1)];
  Object.defineProperty(accessor, "0", {
    get: () => {
      throw new Error("Untrusted accessor");
    },
  });
  assert.equal((await f.queries.byIds(accessor, signal())).status, "invalid_input");
  assert.equal(
    (
      await f.queries.byIds(
        Array.from({ length: 21 }, () => id(1)),
        signal(),
      )
    ).status,
    "invalid_input",
  );
  assert.equal(f.state.calls, 0);
  const result = await f.queries.byIds([id(3), id(99), id(1), id(3)], signal());
  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.value.map((title) => title?.id ?? null),
    [id(3), null, id(1), id(3)],
  );
  assert.equal(f.state.calls, 1);
  assert.deepEqual(await f.queries.byIds([], signal()), { status: "completed", value: [] });
  assert.equal(f.state.calls, 1);
});

test("public reads reject corrupt owner rows, excessive pages, wrong order and dependency faults", async () => {
  for (const values of [
    [publicCandidate(2), publicCandidate(1)],
    [publicCandidate(1), publicCandidate(1)],
    [publicCandidate(1), publicCandidate(2), publicCandidate(3)],
    [{ ...publicCandidate(), metadata: null }],
  ]) {
    const queries = createCatalogPublicQueries({
      policy,
      now: () => now,
      transactions: {
        run: (work) =>
          work({ browse: () => Promise.resolve(values), findMany: () => Promise.resolve(values) }),
      },
    });
    assert.equal((await queries.browse({ first: 1, after: null }, signal())).status, "unavailable");
    assert.equal((await queries.byIds([id(1)], signal())).status, "unavailable");
  }
  const f = publicFixture();
  const controller = new AbortController();
  controller.abort();
  assert.equal((await f.queries.byIds([id(1)], controller.signal)).status, "cancelled");
  assert.equal(f.state.calls, 0);
  const failing = createCatalogPublicQueries({
    policy,
    now: () => now,
    transactions: {
      run: () => Promise.reject(new Error("private SQL credentials")),
    },
  });
  assert.deepEqual(await failing.browse({ first: 1, after: null }, signal()), {
    status: "unavailable",
  });
  const late = new AbortController();
  const cancelled = createCatalogPublicQueries({
    policy,
    now: () => now,
    transactions: {
      run: async (work, requestSignal) => {
        const result = await f.transactions.run(work, requestSignal);
        late.abort();
        return result;
      },
    },
  });
  assert.equal((await cancelled.byIds([id(1)], late.signal)).status, "cancelled");
});
