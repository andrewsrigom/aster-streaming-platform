import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { readGraphqlResponse } from "../../lib/apollo/response.ts";
import { apolloOperationBody } from "../../lib/apollo/trusted-operation.ts";
import { START_PLAYBACK, playerIdentifier, readPlaybackResult } from "./operations.ts";

export function createPlaybackClient(
  fetcher: typeof fetch = globalThis.fetch,
  now: () => number = () => Date.now() / 1000,
) {
  const lifetime = new AbortController();
  let active = false;
  const transport: typeof fetch = async (_input, init) => {
    lifetime.signal.throwIfAborted();
    if (active || typeof init?.body !== "string" || init.body.length > 4096) {
      throw new Error("Playback request is unavailable.");
    }
    const body = JSON.parse(init.body) as Record<string, unknown>;
    const variables = body["variables"] as Record<string, unknown> | undefined;
    const titleId = variables?.["titleId"];
    if (body["operationName"] !== "StartPlayback" || !playerIdentifier(titleId)) {
      throw new Error("Invalid playback request.");
    }
    const signal = AbortSignal.any([
      lifetime.signal,
      AbortSignal.timeout(4000),
      ...(init.signal ? [init.signal] : []),
    ]);
    active = true;
    try {
      const response = await fetcher("http://127.0.0.1:4000/graphql", {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal,
        headers: { "content-type": "application/json", "x-aster-csrf": "1" },
        body: JSON.stringify({
          operationName: "StartPlayback",
          query: apolloOperationBody(START_PLAYBACK),
          variables: { titleId },
        }),
      });
      const result = await readGraphqlResponse(response, signal);
      signal.throwIfAborted();
      if ("errors" in result || !result["data"] || typeof result["data"] !== "object") {
        throw new Error("Playback request failed.");
      }
      const data = result["data"] as Record<string, unknown>;
      return Response.json({
        data: {
          createPlaybackSession: readPlaybackResult(data["createPlaybackSession"], titleId, now()),
        },
      });
    } catch {
      // A lost acknowledgement is not permission to retry a mutation automatically.
      throw new Error("Playback request failed. Start a new session to try again.");
    } finally {
      active = false;
    }
  };
  const cache = new InMemoryCache();
  const client = new ApolloClient({
    cache,
    link: new HttpLink({ uri: "http://127.0.0.1:4000/graphql", fetch: transport }),
    devtools: { enabled: false },
    defaultOptions: { mutate: { fetchPolicy: "no-cache" } },
  });
  return {
    client,
    dispose() {
      lifetime.abort();
      client.stop();
      cache.restore({});
    },
  };
}
