import { projectPublicData } from "./public-snapshot.ts";

const MAX_RESPONSE_BYTES = 262144;

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
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel();
      throw new Error("Catalog is temporarily unavailable.");
    }
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Catalog returned no response.");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      signal.throwIfAborted();
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        signal.throwIfAborted();
        const { value } = chunk;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          throw new Error("Catalog response exceeded its limit.");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      // No upstream headers or extensions are copied into the Apollo preload.
      const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Invalid Catalog response.");
      }
      if ("errors" in body || !("data" in body)) {
        throw new Error("Catalog is temporarily unavailable.");
      }
      return new Response(
        JSON.stringify({ data: projectPublicData(body.data, operation.operationName) }),
        {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        },
      );
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  };
}
