import { projectPublicData } from "./public-snapshot.ts";
import { readGraphqlResponse } from "./response.ts";

export function boundedGraphqlFetch(fetcher: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    if (typeof init?.body !== "string" || init.body.length > 65536) {
      throw new Error("A versioned public operation is required.");
    }
    const operation: unknown = JSON.parse(init.body);
    if (!operation || typeof operation !== "object" || !("operationName" in operation)) {
      throw new Error("A named public operation is required.");
    }
    const timeout = AbortSignal.timeout(4000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const response = await fetcher(input, {
      ...init,
      signal,
      cache: "no-store",
      redirect: "error",
    });
    const body = await readGraphqlResponse(response, signal);
    if ("errors" in body || !("data" in body)) {
      throw new Error("Catalog is temporarily unavailable.");
    }
    // No upstream headers or extensions are copied into the public preload.
    return Response.json(
      { data: projectPublicData(body["data"], operation.operationName) },
      {
        headers: { "cache-control": "no-store" },
      },
    );
  };
}
