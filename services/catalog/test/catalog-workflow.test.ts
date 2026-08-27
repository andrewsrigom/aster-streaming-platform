import assert from "node:assert/strict";
import test from "node:test";
import { localizeTitle, normalizeTitleMetadata } from "../src/domain/metadata.js";
import { createLocalCatalogOperator } from "../src/infrastructure/identity/local-operator.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";
import {
  metadataFixture,
  publicationFixture,
  rightsFacts,
  workflowFixture,
} from "./workflow-fixture.js";

const input = (version: number, mutation = version + 10) => ({
  titleId: id(1),
  expectedVersion: version,
  mutationId: id(mutation),
});
const create = () => ({ ...input(0), metadata: metadataFixture(), rights: rightsFacts() });
async function ready(f: ReturnType<typeof workflowFixture>) {
  assert.equal((await f.commands.execute("create", create(), f.request)).status, "completed");
  assert.equal(
    (
      await f.commands.execute(
        "review",
        { ...input(2), decision: "approve", reason: "Synthetic review only" },
        f.request,
      )
    ).status,
    "completed",
  );
  f.state().publications.set(id(200), publicationFixture());
  assert.equal(
    (await f.commands.execute("media-ready", { ...input(3), publicationId: id(200) }, f.request))
      .status,
    "completed",
  );
}
test("editorial journey writes immutable review, attributed metadata and versioned publication/retirement events", async () => {
  const f = workflowFixture();
  await ready(f);
  assert.equal((await f.commands.execute("publish", input(4), f.request)).status, "completed");
  assert.equal(f.state().titles.get(id(1))?.state, "PUBLISHED");
  assert.equal(
    (await f.commands.execute("dispute", { ...input(5), reason: "Synthetic dispute" }, f.request))
      .status,
    "completed",
  );
  assert.equal(f.state().titles.get(id(1))?.state, "RETIRED");
  assert.deepEqual(
    f.state().rights.map((entry) => entry.record.status),
    ["DRAFT", "APPROVED", "DISPUTED"],
  );
  assert.equal(f.state().rights[1]?.record.reviewedBy, id(3));
  assert.equal(f.state().audits.length, 5);
  assert.equal(f.state().receipts.length, 5);
  assert.deepEqual(
    f.state().events.map((event) => event.eventType),
    ["catalog.title-published", "catalog.title-retired"],
  );
  const retired = f.state().events[1];
  assert.equal(retired?.aggregate.version, 6);
  assert.equal(retired.payload.rightsRevision, 3);
  assert.equal(retired.causationId, input(5).mutationId);
  assert.equal(retired.occurredAt, new Date(now * 1000).toISOString());
  assert.doesNotMatch(JSON.stringify(retired), /https:|token|cookie/u);
  assert.equal((await f.commands.execute("reopen", input(6), f.request)).status, "completed");
  assert.equal(
    (
      await f.commands.execute(
        "review",
        { ...input(7), decision: "approve", reason: "Old review" },
        f.request,
      )
    ).status,
    "invalid_transition",
  );
  assert.equal(
    (
      await f.commands.execute(
        "edit",
        { ...input(7), metadata: metadataFixture(), rights: rightsFacts() },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal(
    (
      await f.commands.execute(
        "review",
        { ...input(8), decision: "approve", reason: "New review" },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal(f.state().titles.get(id(1))?.rightsRevision, 5);
});
test("missing/copied/foreign/viewer authority cannot enter a transaction; expiry/revocation fail closed", async () => {
  const f = workflowFixture();
  const foreign = workflowFixture();
  for (const credential of [
    undefined,
    {},
    { ...(f.request.credential as object) },
    foreign.request.credential,
    "viewer.jwt",
    { role: "operator" },
  ]) {
    assert.equal(
      (await f.commands.execute("create", create(), { ...f.request, credential })).status,
      "unauthorized",
    );
  }
  assert.equal(f.runs(), 0);
  f.setTime(now + 1800);
  assert.equal((await f.commands.execute("create", create(), f.request)).status, "unauthorized");
  f.setTime(now);
  f.beforeFinish(f.operator.revoke);
  assert.equal((await f.commands.execute("create", create(), f.request)).status, "unauthorized");
  assert.equal(f.state().titles.size, 0);
});
test("explicit local activation rejects hosted mode, missing opt-in and unbounded time", () => {
  for (const config of [
    { environment: "production", operatorEnabled: true, actorId: id(3) },
    { environment: "local", operatorEnabled: false, actorId: id(3) },
    { environment: "local", operatorEnabled: true, actorId: "admin" },
  ]) {
    assert.throws(() => createLocalCatalogOperator(config, now));
  }
  assert.throws(() =>
    createLocalCatalogOperator(
      { environment: "local", operatorEnabled: true, actorId: id(3) },
      Infinity,
    ),
  );
});
test("exact replay preserves response and audit; changed input, actor, version or command conflicts", async () => {
  const f = workflowFixture();
  const command = create();
  const first = await f.commands.execute("create", command, f.request);
  assert.deepEqual(await f.commands.execute("create", command, f.request), first);
  assert.equal(f.state().audits.length, 1);
  assert.equal(
    (
      await f.commands.execute(
        "create",
        { ...command, rights: rightsFacts({ creator: "Changed" }) },
        f.request,
      )
    ).status,
    "conflict",
  );
  assert.equal(
    (await f.commands.execute("edit", { ...command, expectedVersion: 2 }, f.request)).status,
    "conflict",
  );
  assert.equal(
    (await f.commands.execute("edit", { ...command, ...input(1) }, f.request)).status,
    "conflict",
  );
  const receipt = f.state().receipts[0];
  assert.ok(receipt);
  f.state().receipts[0] = { ...receipt, actorId: id(9) };
  assert.equal((await f.commands.execute("create", command, f.request)).status, "conflict");
});
test("unresolved review, expired rights and foreign/unattested media never publish", async () => {
  const f = workflowFixture();
  assert.equal(
    (
      await f.commands.execute(
        "create",
        { ...create(), rights: rightsFacts({ copyrightHolder: null }) },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal(
    (
      await f.commands.execute(
        "review",
        { ...input(2), decision: "approve", reason: "Incomplete" },
        f.request,
      )
    ).status,
    "rights_not_approved",
  );
  assert.equal(f.state().rights.length, 1);
  const g = workflowFixture();
  await ready(g);
  g.state().publications.set(id(200), publicationFixture(id(99)));
  assert.equal(
    (await g.commands.execute("publish", input(4), g.request)).status,
    "media_not_ready",
  );
  g.state().publications.clear();
  assert.equal(
    (await g.commands.execute("publish", input(4), g.request)).status,
    "media_not_ready",
  );
  const latest = g.state().rights[1];
  assert.ok(latest);
  g.state().rights[1] = { ...latest, record: { ...latest.record, validUntil: now } };
  assert.equal(
    (await g.commands.execute("publish", input(4), g.request)).status,
    "rights_not_approved",
  );
  assert.equal(
    (await g.commands.execute("expire", { ...input(4), reason: "Rights expired" }, g.request))
      .status,
    "completed",
  );
  assert.equal(g.state().rights.at(-1)?.record.status, "EXPIRED");
  assert.equal(g.state().events[0]?.eventType, "catalog.title-retired");
});
test("receipt and outbox capacity reserve takedown, which is atomic with cancellation and failures", async () => {
  for (const saturated of ["receipts", "outbox"] as const) {
    const f = workflowFixture();
    await ready(f);
    f.counts[saturated] = saturated === "receipts" ? 60 : 127;
    assert.equal((await f.commands.execute("publish", input(4), f.request)).status, "backpressure");
    assert.equal(
      (await f.commands.execute("retire", { ...input(4), reason: "Takedown" }, f.request)).status,
      "completed",
    );
    assert.equal(f.state().titles.get(id(1))?.state, "RETIRED");
  }
  for (const fault of ["throw", "abort", "expire"] as const) {
    const f = workflowFixture();
    await ready(f);
    f.beforeFinish(() => {
      if (fault === "throw") {
        throw new Error("Injected persistence failure");
      }
      if (fault === "abort") {
        f.controller.abort();
      } else {
        f.setTime(now + 1800);
      }
    });
    assert.equal(
      (await f.commands.execute("publish", input(4), f.request)).status,
      fault === "throw" ? "unavailable" : fault === "abort" ? "cancelled" : "unauthorized",
    );
    assert.equal(f.state().titles.get(id(1))?.state, "MEDIA_READY");
    assert.equal(f.state().events.length, 0);
    assert.equal(f.state().audits.length, 3);
  }
});
test("metadata canonicalizes locale fallback, bounds collections and rejects forged approval fields", async () => {
  const metadata = normalizeTitleMetadata({
    ...metadataFixture(),
    defaultLocale: "pt-br",
    localizations: [
      { locale: "pt-br", title: "Título", synopsis: "Sinopse" },
      { locale: "en", title: "Title", synopsis: "Synopsis" },
    ],
  });
  assert.ok(metadata);
  assert.equal(localizeTitle(metadata, "pt-PT").locale, "pt-BR");
  assert.equal(localizeTitle(metadata, "en-US").locale, "en");
  assert.equal(localizeTitle(metadata, "xx").locale, "pt-BR");
  assert.equal(localizeTitle(metadata, "not a locale").locale, "pt-BR");
  for (const patch of [
    { genres: Array(9).fill("animation") },
    { genres: ["animation", "animation"] },
    { localizations: [] },
    { credits: [{ name: "Name", role: "director", admin: true }] },
  ]) {
    assert.equal(normalizeTitleMetadata({ ...metadataFixture(), ...patch }), undefined);
  }
  const f = workflowFixture();
  for (const command of [
    { ...create(), actorId: id(3) },
    { ...create(), rights: { ...rightsFacts(), status: "APPROVED" } },
    { ...create(), expectedVersion: 1 },
    {
      ...create(),
      metadata: {
        ...metadataFixture(),
        artwork: {
          url: "https://example.invalid/poster.png",
          altText: "Poster",
          rights: { ...rightsFacts(), reviewedBy: id(3) },
        },
      },
    },
  ]) {
    assert.equal((await f.commands.execute("create", command, f.request)).status, "invalid_input");
  }
  assert.equal(f.runs(), 0);
});
test("artwork receives its own operator review and cannot silently substitute a different source", async () => {
  const f = workflowFixture();
  const artwork = {
    url: "https://example.invalid/poster.png",
    altText: "Synthetic poster",
    rights: rightsFacts({ assetSourceUrl: "https://example.invalid/poster.png" }),
  };
  assert.equal(
    (
      await f.commands.execute(
        "create",
        { ...create(), metadata: { ...metadataFixture(), artwork } },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal(f.state().metadata.get(id(1))?.artwork?.rights.status, "DRAFT");
  assert.equal(
    (
      await f.commands.execute(
        "review",
        { ...input(2), decision: "approve", reason: "Both assets reviewed" },
        f.request,
      )
    ).status,
    "completed",
  );
  const reviewed = f.state().metadata.get(id(1))?.artwork?.rights;
  assert.equal(reviewed?.status, "APPROVED");
  assert.equal(reviewed.reviewedBy, id(3));
  assert.notEqual(reviewed.id, f.state().rights.at(-1)?.record.id);
});
