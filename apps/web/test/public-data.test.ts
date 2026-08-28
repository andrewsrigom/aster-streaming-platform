import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { parse, print, Kind } from "graphql";
import {
  BROWSE,
  TITLE_DETAIL,
  browseVariables,
  titleIdentifier,
  type PublicTitle,
} from "../lib/apollo/operations.ts";
import { publicCachePolicies } from "../lib/apollo/policies.ts";
import { boundedGraphqlFetch } from "../lib/apollo/transport.ts";
import { projectPublicData } from "../lib/apollo/public-snapshot.ts";
import { titleMetadata } from "../features/catalog/metadata.ts";

test("title metadata omits absent fields and their separators", () => {
  assert.equal(titleMetadata({ releaseYear: null, runtimeSeconds: null, genres: [] }), "");
  assert.equal(titleMetadata({ releaseYear: 2026, runtimeSeconds: null, genres: [] }), "2026");
  assert.equal(titleMetadata({ releaseYear: null, runtimeSeconds: 6, genres: [] }), "6 seconds");
  assert.equal(
    titleMetadata({ releaseYear: null, runtimeSeconds: null, genres: ["Short"] }),
    "Short",
  );
  assert.equal(
    titleMetadata({ releaseYear: 2026, runtimeSeconds: 6, genres: ["Short", "Animation"] }),
    "2026 · 6 seconds · Short / Animation",
  );
});

test("public Web operations match the versioned Router inventory", async () => {
  const source = parse(
    await readFile(
      new URL("../../../infra/router/known-operations.graphql", import.meta.url),
      "utf8",
    ),
  );
  for (const document of [BROWSE, TITLE_DETAIL]) {
    const operation = document.definitions[0];
    assert.ok(operation?.kind === Kind.OPERATION_DEFINITION);
    const known = source.definitions.find(
      (definition) =>
        definition.kind === Kind.OPERATION_DEFINITION &&
        definition.name?.value === operation.name?.value,
    );
    assert.ok(known);
    assert.equal(print(operation), print(known));
  }
});

test("locale, page and title inputs are deterministic and bounded", () => {
  assert.deepEqual(browseVariables({}), { first: 20, after: null, locale: "en" });
  assert.deepEqual(browseVariables({ locale: "pt-BR", after: "Y3Vyc29y" }), {
    first: 20,
    after: "Y3Vyc29y",
    locale: "pt-BR",
  });
  assert.equal(browseVariables({ locale: "invalid" }).locale, "en");
  for (const after of ["", "a".repeat(257), "../x", ["cursor", "second"]]) {
    assert.throws(() => browseVariables({ after }));
  }
  assert.equal(titleIdentifier("00000000-0000-4000-8000-000000081000"), true);
  for (const value of ["../../private", "not-an-id", "0".repeat(1000)]) {
    assert.equal(titleIdentifier(value), false);
  }
});

test("Apollo restores a deterministic public page without sharing server caches", () => {
  const first = new InMemoryCache({ typePolicies: publicCachePolicies });
  const second = new InMemoryCache({ typePolicies: publicCachePolicies });
  const variables = browseVariables({});
  const data = {
    titles: {
      __typename: "TitleConnection",
      edges: [],
      pageInfo: { __typename: "PageInfo", endCursor: null, hasNextPage: false },
    },
  };
  first.writeQuery({ query: BROWSE, variables, data });
  assert.equal(second.readQuery({ query: BROWSE, variables }), null);
  const snapshot = JSON.parse(JSON.stringify(first.extract())) as ReturnType<
    InMemoryCache["extract"]
  >;
  second.restore(snapshot);
  assert.deepEqual(
    second.readQuery({ query: BROWSE, variables }),
    first.readQuery({ query: BROWSE, variables }),
  );
  assert.equal(
    second.readQuery({ query: BROWSE, variables: { ...variables, after: "another" } }),
    null,
  );
});

test("GraphQL transport removes upstream headers/extensions and propagates cancellation", async () => {
  const controller = new AbortController();
  let received: RequestInit | undefined;
  const transport = boundedGraphqlFetch((_input, init) => {
    received = init;
    return Promise.resolve(
      Response.json(
        {
          data: {
            titles: {
              edges: [],
              pageInfo: { endCursor: null, hasNextPage: false },
              cookie: "server-canary",
            },
            private: "server-canary",
          },
          extensions: { private: "server-canary" },
        },
        { headers: { "set-cookie": "canary=private" } },
      ),
    );
  });
  const response = await transport("http://router.invalid/graphql", {
    signal: controller.signal,
    body: JSON.stringify({ operationName: "Browse" }),
  });
  assert.deepEqual(await response.json(), {
    data: { titles: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } } },
  });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.ok(received);
  assert.equal(received.cache, "no-store");
  assert.equal(received.redirect, "error");
  controller.abort();
  assert.equal(received.signal?.aborted, true);
});

test("bad, excessive and failed GraphQL responses do not hydrate as successful data", async () => {
  for (const response of [
    new Response("private failure", { status: 503 }),
    new Response("<html>not JSON</html>"),
    Response.json({ errors: [{ message: "private SQL" }] }),
    Response.json({ data: null, errors: [{ message: "private SQL" }] }),
    Response.json(["unexpected"]),
    Response.json({ data: "x".repeat(262144) }),
    new Response("{bad JSON", { headers: { "content-type": "application/json" } }),
  ]) {
    const transport = boundedGraphqlFetch(() => Promise.resolve(response));
    await assert.rejects(
      transport("http://router.invalid/graphql", {
        body: JSON.stringify({ operationName: "Browse" }),
      }),
    );
  }
});

test("public snapshot rejects incomplete or unbounded data and strips unselected fields", () => {
  assert.deepEqual(projectPublicData({ title: null, session: "private" }, "TitleDetail"), {
    title: null,
  });
  assert.throws(() => projectPublicData({ title: null }, "Profiles"));
  assert.throws(() => projectPublicData({ titles: { edges: [] } }, "Browse"));
  assert.throws(() =>
    projectPublicData({ titles: { edges: Array.from({ length: 21 }, () => ({})) } }, "Browse"),
  );
});

test("expected errors are sanitized return values, never successful empty data or leaked parser input", async () => {
  let fail = false;
  const data = { titles: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } } };
  const client = new ApolloClient({
    cache: new InMemoryCache({ typePolicies: publicCachePolicies }),
    link: new HttpLink({
      uri: "http://router.invalid/graphql",
      fetch: boundedGraphqlFetch(() =>
        Promise.resolve(
          fail
            ? new Response('private-parser-canary{"bad', {
                headers: { "content-type": "application/json" },
              })
            : Response.json({ data }),
        ),
      ),
    }),
  });
  try {
    const options = {
      query: BROWSE,
      variables: browseVariables({}),
      errorPolicy: "all" as const,
      fetchPolicy: "network-only" as const,
    };
    assert.deepEqual((await client.query(options)).data, data);
    fail = true;
    const failed = await client.query(options);
    assert.equal(failed.data, undefined);
    assert.equal(failed.error?.message, "Catalog is temporarily unavailable.");
    assert.doesNotMatch(JSON.stringify(failed.error), /private-parser-canary/u);
    fail = false;
    assert.deepEqual((await client.query(options)).data, data);
  } finally {
    client.stop();
  }
});

test("cache retains only the current page and detail, never a different cursor as a hit", () => {
  const cache = new InMemoryCache({ typePolicies: publicCachePolicies });
  for (let page = 0; page < 100; page++) {
    const variables = { ...browseVariables({}), after: `page${page}` };
    cache.writeQuery({
      query: BROWSE,
      variables,
      data: {
        titles: {
          __typename: "TitleConnection",
          edges: [],
          pageInfo: { __typename: "PageInfo", endCursor: null, hasNextPage: false },
        },
      },
    });
    assert.notEqual(cache.readQuery({ query: BROWSE, variables }), null);
    assert.equal(
      cache.readQuery({ query: BROWSE, variables: { ...variables, after: `page${page + 1}` } }),
      null,
    );
    cache.writeQuery({
      query: TITLE_DETAIL,
      variables: { id: `id${page}`, locale: "en" },
      data: { title: null },
    });
    cache.gc();
  }
  const snapshot = cache.extract();
  assert.equal(Object.keys(snapshot).length, 1);
  assert.deepEqual(Object.keys(snapshot["ROOT_QUERY"] ?? {}).sort(), [
    "__typename",
    "title",
    "titles",
  ]);
  assert.equal(
    cache.readQuery({ query: TITLE_DETAIL, variables: { id: "id0", locale: "en" } }),
    null,
  );
  assert.deepEqual(
    cache.readQuery({ query: TITLE_DETAIL, variables: { id: "id99", locale: "en" } }),
    { title: null },
  );
});

test("orphan collection bounds normalized entities across populated page and detail changes", () => {
  const cache = new InMemoryCache({ typePolicies: publicCachePolicies });
  const title = (id: string): PublicTitle => ({
    __typename: "Title",
    id,
    localized: { locale: "en", title: "Generated", synopsis: "Technical fixture" },
    releaseYear: 2026,
    runtimeSeconds: 6,
    languages: ["en"],
    genres: ["experimental"],
    accessibility: [],
    editorialLabels: [],
    credits: [],
    artwork: null,
    attribution: {
      workTitle: "Generated",
      creator: "Aster contributors",
      copyrightHolder: "Aster contributors",
      sourceUrl: "https://example.invalid/source",
      licenseName: "MIT",
      licenseVersion: "unversioned",
      licenseUrl: "https://example.invalid/license",
      attributionText: "Synthetic",
      modificationNotice: "Synthetic",
    },
  });
  for (let page = 0; page < 25; page++) {
    const variables = { ...browseVariables({}), after: `page${page}` };
    cache.writeQuery({
      query: BROWSE,
      variables,
      data: {
        titles: {
          edges: Array.from({ length: 20 }, (_, index) => ({
            cursor: String(index),
            node: title(`${page}-${index}`),
          })),
          pageInfo: { endCursor: null, hasNextPage: false },
        },
      },
    });
    cache.writeQuery({
      query: TITLE_DETAIL,
      variables: { id: `detail${page}`, locale: "en" },
      data: { title: title(`detail${page}`) },
    });
    cache.gc();
    assert.equal(Object.keys(cache.extract()).filter((key) => key.startsWith("Title:")).length, 21);
  }
});
