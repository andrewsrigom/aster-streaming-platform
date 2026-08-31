import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Kind, print, type DocumentNode } from "graphql";
import { HOME_PERSONALIZED, HOME_PUBLIC, SEARCH_TITLES } from "../features/discovery/operations.ts";
import {
  libraryOperations,
  SET_WATCHLIST,
  WATCHLIST_MEMBERSHIP,
} from "../features/engagement/library-operations.ts";
import { PLAYER_PROGRESS, RECORD_PROGRESS } from "../features/engagement/operations.ts";
import {
  CREATE_PROFILE,
  DEMO_SIGN_IN,
  PROFILES,
  SELECT_PROFILE,
  SIGN_OUT,
  VIEWER,
} from "../features/identity/operations.ts";
import { START_PLAYBACK } from "../features/playback/operations.ts";
import { BROWSE, TITLE_DETAIL } from "../lib/apollo/operations.ts";

const documents: readonly DocumentNode[] = [
  BROWSE,
  TITLE_DETAIL,
  VIEWER,
  PROFILES,
  DEMO_SIGN_IN,
  SIGN_OUT,
  CREATE_PROFILE,
  SELECT_PROFILE,
  HOME_PUBLIC,
  SEARCH_TITLES,
  HOME_PERSONALIZED,
  START_PLAYBACK,
  PLAYER_PROGRESS,
  RECORD_PROGRESS,
  ...Object.values(libraryOperations).map(({ document }) => document),
  WATCHLIST_MEMBERSHIP,
  SET_WATCHLIST,
];

test("every Web GraphQL document exactly matches the deployed trusted-operation manifest", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../../../infra/router/generated/persisted-query-manifest.json", import.meta.url),
      "utf8",
    ),
  ) as { operations: { body: string; id: string; name: string }[] };
  const trusted = new Map(manifest.operations.map((entry) => [entry.name, entry]));
  assert.equal(documents.length, 19);
  assert.equal(new Set(documents).size, documents.length);

  for (const document of documents) {
    const definitions = document.definitions.filter(
      (definition) => definition.kind === Kind.OPERATION_DEFINITION,
    );
    assert.equal(definitions.length, 1);
    const definition = definitions[0];
    assert.ok(definition?.name);
    const body = print(definition);
    const entry = trusted.get(definition.name.value);
    assert.ok(entry, definition.name.value + " is absent from the trusted manifest");
    assert.equal(entry.body, body);
    assert.equal(entry.id, createHash("sha256").update(body).digest("hex"));
  }
});
