import assert from "node:assert/strict";
import test from "node:test";

import type {
  AsterPostgresAdapter,
  AsterPostgresQuery,
  AsterPostgresRows,
  AsterPostgresTransactionResult,
} from "@aster/postgres";
import { createPostgresCatalogRights } from "../src/infrastructure/persistence/postgres-rights.js";
import { catalogTestId as id, provenanceFixture, rightsFixture } from "./rights-fixture.js";

function fixture(responses: readonly AsterPostgresRows[] = []) {
  const queries: AsterPostgresQuery[] = [];
  const decisions: string[] = [];
  const database: Pick<AsterPostgresAdapter, "transaction"> = {
    async transaction(work) {
      try {
        const result = await work({
          query(query) {
            queries.push(query);
            return Promise.resolve(responses[queries.length - 1] ?? { rowCount: 1, rows: [] });
          },
        });
        decisions.push(result.action);
        return {
          status: result.action === "commit" ? "committed" : "rolled_back",
          value: result.value,
        };
      } catch {
        return { status: "failed" };
      }
    },
  };
  return { store: createPostgresCatalogRights(database), queries, decisions };
}
const signal = () => new AbortController().signal;
const revisionRow = (revision = 1) => ({
  id: id(revision + 1),
  title_id: id(1),
  revision,
  status: "DRAFT",
  record: rightsFixture({ id: id(revision + 1), revision }),
  actor_id: id(3),
  recorded_at: "1787800000",
  correlation_id: id(4),
  title_version: revision + 1,
});

test("append atomically advances title, inserts facts and provenance with bounded parameters", async () => {
  const f = fixture();
  const outcome = await f.store.run(
    async (tx) => ({
      status: "completed",
      value: await tx.appendRights(rightsFixture(), 1, provenanceFixture()),
    }),
    signal(),
  );
  assert.deepEqual(outcome, { status: "completed", value: true });
  assert.equal(f.queries.length, 3);
  const [advance, insert, audit] = f.queries;
  assert.ok(advance && insert && audit);
  assert.match(advance.text, /version = version \+ 1/u);
  assert.match(insert.text, /INSERT INTO catalog.rights_revisions/u);
  assert.match(audit.text, /INSERT INTO catalog.rights_audit/u);
  assert.deepEqual(f.decisions, ["commit"]);
});

test("stale append returns false without facts or provenance inserts", async () => {
  const f = fixture([{ rowCount: 0, rows: [] }]);
  assert.deepEqual(
    await f.store.run(
      async (tx) => ({
        status: "completed",
        value: await tx.appendRights(rightsFixture(), 1, provenanceFixture()),
      }),
      signal(),
    ),
    { status: "completed", value: false },
  );
  assert.equal(f.queries.length, 1);
});

test("invalid rights, versions and provenance reject before SQL", async () => {
  for (const [record, version, provenance] of [
    [rightsFixture({ revision: 0 }), 1, provenanceFixture()],
    [rightsFixture(), 0, provenanceFixture()],
    [rightsFixture(), 2_147_483_647, provenanceFixture()],
    [rightsFixture(), 1, { ...provenanceFixture(), actorId: "viewer" }],
    [rightsFixture(), 1, { ...provenanceFixture(), recordedAt: NaN }],
    [rightsFixture(), 1, { ...provenanceFixture(), extra: true }],
  ] as const) {
    const f = fixture();
    assert.equal(
      (
        await f.store.run(
          async (tx) => ({
            status: "completed",
            value: await tx.appendRights(record, version, provenance),
          }),
          signal(),
        )
      ).status,
      "invalid_input",
    );
    assert.equal(f.queries.length, 0);
    assert.deepEqual(f.decisions, ["rollback"]);
  }
});

test("large Unicode records preserve surrogate pairs within the shared parameter limit", async () => {
  const f = fixture();
  const record = rightsFixture({
    workTitle: "🎬".repeat(512),
    creator: "🎬".repeat(512),
    copyrightHolder: "🎬".repeat(512),
    attributionText: "🎬".repeat(512),
    modificationNotice: "🎬".repeat(512),
  });
  assert.equal(
    (
      await f.store.run(
        async (tx) => ({
          status: "completed",
          value: await tx.appendRights(record, 1, provenanceFixture()),
        }),
        signal(),
      )
    ).status,
    "completed",
  );
  const inserted = f.queries[1];
  assert.ok(inserted?.values);
  const parts = inserted.values.slice(4) as string[];
  assert.ok(
    parts.every(
      (part) =>
        part.length <= 4000 && !/[\uD800-\uDBFF]$/u.test(part) && !/^[\uDC00-\uDFFF]/u.test(part),
    ),
  );
  assert.deepEqual(JSON.parse(parts.join("")), record);
});

test("aggregate rights payload has a byte bound even if each field is individually valid", async () => {
  const f = fixture();
  const record = rightsFixture({
    workTitle: "界".repeat(1024),
    creator: "界".repeat(1024),
    copyrightHolder: "界".repeat(1024),
    attributionText: "界".repeat(1024),
    modificationNotice: "界".repeat(1024),
    thirdPartyMaterialNotes: "界".repeat(1024),
    trademarkNotes: "界".repeat(1024),
    licenseName: "界".repeat(1024),
    canonicalSourceUrl: "https://example.invalid/" + "x".repeat(2000),
    assetSourceUrl: "https://example.invalid/" + "x".repeat(2000),
    licenseUrl: "https://example.invalid/" + "x".repeat(2000),
  });
  assert.equal(
    (
      await f.store.run(
        async (tx) => ({
          status: "completed",
          value: await tx.appendRights(record, 1, provenanceFixture()),
        }),
        signal(),
      )
    ).status,
    "invalid_input",
  );
  assert.equal(f.queries.length, 0);
});

test("draft creation, missing title and existing title use explicit results", async () => {
  const f = fixture([
    { rowCount: 1, rows: [] },
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  assert.deepEqual(
    await f.store.run(async (tx) => {
      const created = await tx.createDraft(id(1));
      const duplicate = await tx.createDraft(id(1));
      const missing = await tx.lockTitle(id(99));
      return { status: "completed", value: { created, duplicate, missing } };
    }, signal()),
    { status: "completed", value: { created: true, duplicate: false, missing: undefined } },
  );
});

test("title and revision reads validate owner, linkage, timestamps and persisted domain fields", async () => {
  const validTitle = {
    id: id(1),
    version: 1,
    state: "DRAFT",
    rights_revision: null,
    publication_id: null,
    latest_rights_revision: null,
  };
  const f = fixture([
    { rowCount: 1, rows: [validTitle] },
    { rowCount: 1, rows: [revisionRow()] },
  ]);
  const result = await f.store.run(
    async (tx) => ({
      status: "completed",
      value: { title: await tx.lockTitle(id(1)), rights: await tx.findRights(id(1), 1) },
    }),
    signal(),
  );
  assert.equal(result.status, "completed");
  assert.equal(result.value.title?.latestRightsRevision, 0);
  assert.equal(result.value.rights?.recordedAt, 1787800000);
  assert.ok(Object.isFrozen(result.value.rights.record));
  for (const value of [
    { ...revisionRow(), title_id: id(99) },
    { ...revisionRow(), status: "APPROVED" },
    { ...revisionRow(), recorded_at: "invalid" },
    { ...revisionRow(), record: { ...rightsFixture(), extra: true } },
    { ...revisionRow(), actor_id: "untrusted-name" },
  ]) {
    const corrupt = fixture([{ rowCount: 1, rows: [value] }]);
    assert.equal(
      (
        await corrupt.store.run(
          async (tx) => ({
            status: "completed",
            value: await tx.findRights(id(1), 1),
          }),
          signal(),
        )
      ).status,
      "unavailable",
    );
  }
  const wrongTitle = fixture([{ rowCount: 1, rows: [{ ...validTitle, id: id(99) }] }]);
  assert.equal(
    (
      await wrongTitle.store.run(
        async (tx) => ({
          status: "completed",
          value: await tx.lockTitle(id(1)),
        }),
        signal(),
      )
    ).status,
    "unavailable",
  );
});

test("history keysets are bounded, descending, owner-filtered and immutable", async () => {
  const f = fixture([{ rowCount: 2, rows: [revisionRow(2), revisionRow(1)] }]);
  const result = await f.store.run(
    async (tx) => ({
      status: "completed",
      value: await tx.listRights(id(1), 3, 2),
    }),
    signal(),
  );
  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.value.map((item) => item.record.revision),
    [2, 1],
  );
  assert.ok(Object.isFrozen(result.value));
  for (const page of [
    [revisionRow(1), revisionRow(2)],
    [revisionRow(1), revisionRow(1)],
    [revisionRow(3)],
    [{ ...revisionRow(1), title_id: id(9) }],
  ]) {
    const bad = fixture([{ rowCount: page.length, rows: page }]);
    assert.equal(
      (
        await bad.store.run(
          async (tx) => ({
            status: "completed",
            value: await tx.listRights(id(1), 3, 2),
          }),
          signal(),
        )
      ).status,
      "unavailable",
    );
  }
  for (const count of [0, 51, NaN, 1.5]) {
    const bad = fixture();
    assert.equal(
      (
        await bad.store.run(
          async (tx) => ({
            status: "completed",
            value: await tx.listRights(id(1), null, count),
          }),
          signal(),
        )
      ).status,
      "invalid_input",
    );
    assert.equal(bad.queries.length, 0);
  }
});

test("caller rejection rolls back and adapter outcomes never become success", async () => {
  const f = fixture();
  assert.deepEqual(await f.store.run(() => Promise.resolve({ status: "conflict" }), signal()), {
    status: "conflict",
  });
  assert.deepEqual(f.decisions, ["rollback"]);
  for (const status of [
    "aborted",
    "timed_out",
    "failed",
    "unavailable",
    "indeterminate",
  ] as const) {
    const store = createPostgresCatalogRights({
      transaction: <T>(): Promise<AsterPostgresTransactionResult<T>> => Promise.resolve({ status }),
    });
    assert.equal(
      (await store.run(() => Promise.resolve({ status: "completed", value: true }), signal()))
        .status,
      status === "aborted"
        ? "cancelled"
        : status === "indeterminate"
          ? "indeterminate"
          : "unavailable",
    );
  }
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    (await f.store.run(() => Promise.reject(new Error("must not run")), controller.signal)).status,
    "cancelled",
  );
});
