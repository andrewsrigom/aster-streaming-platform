import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { projectSelectedData } from "../../lib/apollo/public-snapshot.ts";
import { readGraphqlResponse } from "../../lib/apollo/response.ts";
import { identityOperations } from "./operations.ts";

export function createIdentityClient(fetcher: typeof fetch = globalThis.fetch) {
  const lifetime = new AbortController();
  let active = 0;
  const transport: typeof fetch = async (_input, init) => {
    lifetime.signal.throwIfAborted();
    if (active >= 2 || typeof init?.body !== "string" || init.body.length > 16384) {
      throw new Error("Identity request is unavailable.");
    }
    const request: unknown = JSON.parse(init.body);
    const name =
      request && typeof request === "object" && "operationName" in request
        ? request.operationName
        : undefined;
    if (typeof name !== "string" || !Object.hasOwn(identityOperations, name)) {
      throw new Error("Unknown Identity operation.");
    }
    const signal = AbortSignal.any([
      lifetime.signal,
      AbortSignal.timeout(4000),
      ...(init.signal ? [init.signal] : []),
    ]);
    active++;
    try {
      const response = await fetcher("http://127.0.0.1:4000/graphql", {
        ...init,
        method: "POST",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        signal,
        headers: { "content-type": "application/json", "x-aster-csrf": "1" },
      });
      const body = await readGraphqlResponse(response, signal);
      signal.throwIfAborted();
      if ("errors" in body) {
        return Response.json({
          errors: [
            {
              message: "Identity is unavailable. Refresh the session.",
              extensions: { code: "UNAVAILABLE" },
            },
          ],
        });
      }
      return Response.json({
        data: projectSelectedData(
          body["data"],
          identityOperations[name as keyof typeof identityOperations],
        ),
      });
    } finally {
      active--;
    }
  };
  const cache = new InMemoryCache({
    typePolicies: {
      Profile: { keyFields: ["id"] },
      OwnedProfiles: { merge: false },
      Query: { fields: { profiles: { merge: false }, me: { merge: false } } },
    },
  });
  const client = new ApolloClient({
    cache,
    link: new HttpLink({ uri: "http://127.0.0.1:4000/graphql", fetch: transport }),
    devtools: { enabled: false },
    defaultOptions: { watchQuery: { fetchPolicy: "network-only", nextFetchPolicy: "cache-first" } },
  });
  return {
    client,
    isDisposed: () => lifetime.signal.aborted,
    dispose() {
      lifetime.abort();
      client.stop();
      cache.restore({});
    },
  };
}
