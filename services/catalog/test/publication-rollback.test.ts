import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import type { ValidatedPublicationReference } from "../src/domain/title.js";
import { readOperatorInput } from "../src/transport/operator-input.js";
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
const replacement = (version = 5, publicationId = id(202)) => ({
  ...input(version),
  publicationId,
  reason: "Synthetic publication recovery",
});
async function published(validUntil: number | null = null) {
  const f = workflowFixture();
  assert.equal(
    (
      await f.commands.execute(
        "create",
        {
          ...input(0),
          metadata: metadataFixture(),
          rights: rightsFacts({ validUntil }),
        },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal(
    (
      await f.commands.execute(
        "review",
        {
          ...input(2),
          decision: "approve",
          reason: "Synthetic review",
        },
        f.request,
      )
    ).status,
    "completed",
  );
  f.state().publications.set(id(200), publicationFixture());
  f.state().publications.set(id(202), {
    ...publicationFixture(),
    id: id(202),
    validationReportId: id(203),
    manifestUrl: "https://example.invalid/media/v2/master.m3u8",
  });
  assert.equal(
    (
      await f.commands.execute(
        "media-ready",
        {
          ...input(3),
          publicationId: id(200),
        },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal((await f.commands.execute("publish", input(4), f.request)).status, "completed");
  return f;
}

test("publication replacement and rollback preserve approval and immutable activation history", async () => {
  const f = await published();
  const rights = structuredClone(f.state().rights);
  const metadata = structuredClone(f.state().metadata);
  assert.equal((await f.commands.execute("replace", replacement(), f.request)).status, "completed");
  assert.equal(f.state().titles.get(id(1))?.publicationId, id(202));
  // A future relay may remove delivered outbox rows, but not activation history.
  f.state().events.length = 0;
  const command = replacement(6, id(200));
  const rolled = await f.commands.execute("rollback", command, f.request);
  assert.equal(rolled.status, "completed");
  assert.deepEqual(rolled.value, {
    titleId: id(1),
    version: 7,
    state: "PUBLISHED",
    rightsRevision: 2,
    publicationId: id(200),
  });
  assert.deepEqual(await f.commands.execute("rollback", command, f.request), rolled);
  assert.equal(
    (
      await f.commands.execute(
        "rollback",
        {
          ...command,
          publicationId: id(202),
        },
        f.request,
      )
    ).status,
    "conflict",
  );
  assert.deepEqual(f.state().rights, rights);
  assert.deepEqual(f.state().metadata, metadata);
  assert.deepEqual(
    f.state().activations.map((event) => event.payload.publicationId),
    [id(200), id(202), id(200)],
  );
  assert.equal(f.state().events.length, 1);
  assert.equal(f.state().events[0]?.aggregate.version, 7);
  assert.equal(f.state().events[0]?.eventType, "catalog.title-published");
  assert.equal(f.state().audits.at(-1)?.kind, "rollback");
  assert.equal(f.state().audits.at(-1)?.reason, command.reason);
  assert.equal(f.state().publications.size, 2);
});

test("rollback refuses an unactivated candidate, current pointer and retired or disputed titles", async () => {
  const f = await published();
  const before = structuredClone(f.state());
  for (const publicationId of [id(202), id(200), id(999)]) {
    assert.equal(
      (await f.commands.execute("rollback", replacement(5, publicationId), f.request)).status,
      "media_not_ready",
    );
    assert.deepEqual(f.state(), before);
  }
  assert.equal((await f.commands.execute("replace", replacement(), f.request)).status, "completed");
  assert.equal(
    (
      await f.commands.execute(
        "dispute",
        {
          ...input(6),
          reason: "Synthetic dispute",
        },
        f.request,
      )
    ).status,
    "completed",
  );
  const disputed = structuredClone(f.state());
  assert.equal(
    (await f.commands.execute("rollback", replacement(7, id(200)), f.request)).status,
    "rights_not_approved",
  );
  assert.deepEqual(f.state(), disputed);
  const retired = await published();
  assert.equal(
    (
      await retired.commands.execute(
        "retire",
        {
          ...input(5),
          reason: "Synthetic retirement",
        },
        retired.request,
      )
    ).status,
    "completed",
  );
  assert.equal(
    (await retired.commands.execute("replace", replacement(6), retired.request)).status,
    "invalid_transition",
  );
});

test("replacement rejects foreign, stale, corrupt, future and disallowed local references", async () => {
  const patches: Partial<ValidatedPublicationReference>[] = [
    { titleId: id(9) },
    { rightsRevision: 1 },
    { sourceChecksum: "b".repeat(64) },
    { validatedAt: now + 1 },
    { validatedAt: now - 1 },
    { validationReportId: "forged" },
    {
      manifestUrl:
        "http://127.0.0.1:9001/aster-media-published/publications/" +
        "a".repeat(64) +
        "/master.m3u8",
    },
  ];
  for (const patch of patches) {
    const f = await published();
    f.state().publications.set(id(202), {
      ...publicationFixture(),
      id: id(202),
      validationReportId: id(203),
      ...patch,
    });
    const before = structuredClone(f.state());
    assert.equal(
      (await f.commands.execute("replace", replacement(), f.request)).status,
      "media_not_ready",
    );
    assert.deepEqual(f.state(), before);
  }
});

test("replacement commands keep strict CLI input, authority, optimistic version and takedown reserve", async () => {
  const f = await published();
  for (const command of ["replace", "rollback"] as const) {
    const envelope = { command, input: replacement() };
    assert.deepEqual(
      await readOperatorInput(
        Readable.from([Buffer.from(JSON.stringify(envelope))]),
        f.request.signal,
      ),
      envelope,
    );
    for (const patch of [
      { reason: "" },
      { reason: "x".repeat(513) },
      { publicationId: "bad" },
      { approved: true },
      { manifestUrl: "https://example.invalid/arbitrary.m3u8" },
    ]) {
      assert.equal(
        (await f.commands.execute(command, { ...replacement(), ...patch }, f.request)).status,
        "invalid_input",
      );
    }
    assert.equal(
      (
        await f.commands.execute(command, replacement(), {
          ...f.request,
          credential: {},
        })
      ).status,
      "unauthorized",
    );
    assert.equal((await f.commands.execute(command, replacement(4), f.request)).status, "conflict");
    assert.equal(
      (
        await f.commands.execute(command, replacement(), {
          ...f.request,
          signal: AbortSignal.abort(),
        })
      ).status,
      "cancelled",
    );
  }
  f.counts.outbox = 126;
  assert.equal(
    (await f.commands.execute("replace", replacement(), f.request)).status,
    "backpressure",
  );
  assert.equal(
    (
      await f.commands.execute(
        "retire",
        {
          ...input(5),
          reason: "Reserved takedown",
        },
        f.request,
      )
    ).status,
    "completed",
  );
});

test("replacement and rollback undo pointer, audit, event and activation when final checks fail", async () => {
  for (const command of ["replace", "rollback"] as const) {
    for (const fault of ["throw", "abort", "rights-expire", "revoke"] as const) {
      const f = await published(now + 10);
      if (command === "rollback") {
        assert.equal(
          (await f.commands.execute("replace", replacement(), f.request)).status,
          "completed",
        );
      }
      const before = structuredClone(f.state());
      f.beforeFinish(() => {
        if (fault === "throw") {
          throw new Error("Synthetic commit failure");
        }
        if (fault === "abort") {
          f.controller.abort();
        }
        if (fault === "rights-expire") {
          f.setTime(now + 10);
        }
        if (fault === "revoke") {
          f.operator.revoke();
        }
      });
      const result = await f.commands.execute(
        command,
        replacement(command === "rollback" ? 6 : 5, command === "rollback" ? id(200) : id(202)),
        f.request,
      );
      assert.equal(
        result.status,
        {
          throw: "unavailable",
          abort: "cancelled",
          "rights-expire": "rights_not_approved",
          revoke: "unauthorized",
        }[fault],
      );
      assert.deepEqual(f.state(), before);
    }
  }
});
