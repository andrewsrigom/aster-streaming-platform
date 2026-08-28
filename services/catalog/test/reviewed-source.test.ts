import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeCatalogCommand } from "../src/application/command-input.js";
import { approveRights, deriveAttribution } from "../src/domain/rights.js";
import { transitionTitle } from "../src/domain/title.js";

test("reviewed official source is a valid draft, not a self-approved publication", async () => {
  const envelope: unknown = JSON.parse(
    await readFile(new URL("../../examples/big-buck-bunny.json", import.meta.url), "utf8"),
  );
  assert.ok(envelope && typeof envelope === "object" && "input" in envelope);
  const command = normalizeCatalogCommand("create", envelope.input);
  assert.ok(command && command.kind === "create");
  assert.equal(command.rights.status, "DRAFT");
  assert.equal(command.rights.sourceChecksum, null);
  assert.equal(command.rights.reviewedBy, null);
  assert.equal(command.metadata.runtimeSeconds, null);
  assert.equal(command.metadata.artwork, null);
  assert.deepEqual(command.metadata.accessibility, []);
  assert.equal(
    command.rights.assetSourceUrl,
    "https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v.zip",
  );
  const now = Date.UTC(2026, 7, 28) / 1000;
  const policy = { commercial: true };
  assert.equal(approveRights(command.rights, now, policy).status, "rejected");
  const reviewed = approveRights(
    {
      ...command.rights,
      reviewedBy: "00000000-0000-4000-8000-000000000003",
      reviewedAt: now,
    },
    now,
    policy,
  );
  assert.equal(reviewed.status, "approved");
  const attribution = deriveAttribution(reviewed.record, now, policy);
  assert.ok(attribution);
  assert.equal(attribution.licenseVersion, "3.0");
  assert.match(attribution.attributionText, /Retain the complete film credits/u);
  assert.equal(
    transitionTitle(
      {
        id: command.titleId,
        version: 3,
        state: "RIGHTS_REVIEWED",
        rightsRevision: 1,
        publicationId: null,
      },
      "MEDIA_READY",
      { rights: reviewed.record, publication: null, now, policy },
    ).status,
    "rejected",
  );
});
