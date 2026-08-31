import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { Kind, OperationTypeNode, type DocumentNode } from "graphql";
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
import { apolloOperationBody } from "../lib/apollo/trusted-operation.ts";

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

type ManifestEntry = Readonly<{ body: string; id: string; name: string }>;

function indexManifestOperations(
  operations: readonly ManifestEntry[],
): Map<string, ManifestEntry[]> {
  const indexed = new Map<string, ManifestEntry[]>();
  for (const entry of operations) {
    const versions = indexed.get(entry.name) ?? [];
    versions.push(entry);
    indexed.set(entry.name, versions);
  }
  return indexed;
}

function requireTrustedBody(
  indexed: ReadonlyMap<string, readonly ManifestEntry[]>,
  name: string,
  body: string,
): ManifestEntry {
  const versions = indexed.get(name);
  assert.ok(versions, name + " is absent from the trusted manifest");
  const match = versions.find((entry) => entry.body === body);
  assert.ok(match, name + " body is absent from the trusted manifest");
  return match;
}

test("current Web bodies remain trusted beside a later-sorting retained version", () => {
  const current = { body: "query Browse { current }", id: "0", name: "Browse" };
  const retained = { body: "query Browse { retained }", id: "f", name: "Browse" };
  const indexed = indexManifestOperations([current, retained]);

  assert.equal(requireTrustedBody(indexed, current.name, current.body), current);
});

test("every Web GraphQL document exactly matches the deployed trusted-operation manifest", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../../../infra/router/generated/persisted-query-manifest.json", import.meta.url),
      "utf8",
    ),
  ) as { operations: ManifestEntry[] };
  const trusted = indexManifestOperations(manifest.operations);
  assert.equal(documents.length, 19);
  assert.equal(new Set(documents).size, documents.length);

  for (const document of documents) {
    const definitions = document.definitions.filter(
      (definition) => definition.kind === Kind.OPERATION_DEFINITION,
    );
    assert.equal(definitions.length, 1);
    const definition = definitions[0];
    assert.ok(definition?.name);
    const body = apolloOperationBody({ kind: Kind.DOCUMENT, definitions: [definition] });
    const entry = requireTrustedBody(trusted, definition.name.value, body);
    assert.equal(entry.id, createHash("sha256").update(body).digest("hex"));
  }
});

test("the actual Apollo HttpLink wire document matches every Web manifest entry", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../../../infra/router/generated/persisted-query-manifest.json", import.meta.url),
      "utf8",
    ),
  ) as { operations: ManifestEntry[] };
  const trusted = indexManifestOperations(manifest.operations);

  for (const document of documents) {
    const definition = document.definitions.find(
      (entry) => entry.kind === Kind.OPERATION_DEFINITION,
    );
    assert.ok(definition?.name);
    let wire: Record<string, unknown> | undefined;
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new HttpLink({
        uri: "http://router.invalid/graphql",
        fetch: (_input, init) => {
          assert.ok(typeof init?.body === "string");
          wire = JSON.parse(init.body) as Record<string, unknown>;
          return Promise.resolve(Response.json({ data: null }));
        },
      }),
    });
    try {
      if (definition.operation === OperationTypeNode.MUTATION) {
        await client.mutate({ mutation: document, variables: {} }).catch(() => undefined);
      } else {
        await client
          .query({ query: document, variables: {}, fetchPolicy: "no-cache" })
          .catch(() => undefined);
      }
      assert.ok(wire);
      assert.equal(wire["operationName"], definition.name.value);
      assert.ok(typeof wire["query"] === "string");
      requireTrustedBody(trusted, definition.name.value, wire["query"]);
    } finally {
      client.stop();
    }
  }
});
