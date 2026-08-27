import { addAbortSignal, type Readable } from "node:stream";
import type { CatalogCommandKind } from "../application/operator-ports.js";
import { catalogRecord } from "../domain/values.js";

export async function readOperatorInput(
  source: Readable,
  signal: AbortSignal,
): Promise<Readonly<{ command: CatalogCommandKind | "inspect"; input: unknown }>> {
  const parts: Buffer[] = [];
  let bytes = 0;
  addAbortSignal(signal, source);
  for await (const chunk of source) {
    if (!Buffer.isBuffer(chunk)) {
      throw new Error("Invalid command encoding.");
    }
    bytes += chunk.byteLength;
    if (bytes > 65536) {
      throw new Error("Catalog command exceeds its input bound.");
    }
    parts.push(chunk);
  }
  signal.throwIfAborted();
  const input = catalogRecord(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts, bytes))),
    ["command", "input"],
  );
  if (
    !input ||
    ![
      "inspect",
      "create",
      "edit",
      "review",
      "media-ready",
      "publish",
      "retire",
      "dispute",
      "expire",
      "reopen",
    ].includes(input["command"] as string)
  ) {
    throw new Error("Invalid Catalog command.");
  }
  return { command: input["command"] as CatalogCommandKind | "inspect", input: input["input"] };
}
