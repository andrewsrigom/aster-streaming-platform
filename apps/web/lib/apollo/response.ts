export async function readGraphqlResponse(
  response: Response,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    await response.body?.cancel();
    throw new Error("GraphQL is temporarily unavailable.");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("GraphQL returned no response.");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      signal.throwIfAborted();
      size += chunk.value.byteLength;
      if (size > 262144) {
        throw new Error("GraphQL response exceeded its limit.");
      }
      chunks.push(chunk.value);
    }
    signal.throwIfAborted();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid GraphQL response.");
    }
    return body as Record<string, unknown>;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
