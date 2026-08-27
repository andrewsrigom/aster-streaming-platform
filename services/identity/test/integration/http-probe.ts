import assert from "node:assert/strict";

// Fixed loopback fixtures only; bound both the request and the complete response body.
export async function httpProbe(
  port: number,
  path: string,
  body?: string,
): Promise<Readonly<{ status: number; body: string }>> {
  assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
  assert.ok(path.startsWith("/") && path.length <= 1_024);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 1_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { body }),
      signal: controller.signal,
      redirect: "error",
      headers: { "content-type": "application/json", connection: "close" },
    });
    reader = response.body?.getReader();
    assert.ok(reader);
    let length = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      length += next.value.byteLength;
      assert.ok(length <= 128 * 1_024, "Fixture HTTP response exceeds its byte limit");
      chunks.push(next.value);
    }
    return { status: response.status, body: Buffer.concat(chunks, length).toString("utf8") };
  } finally {
    controller.abort();
    clearTimeout(timeout);
    reader?.releaseLock();
  }
}
