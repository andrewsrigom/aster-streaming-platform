import {
  Agent,
  request,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import { Readable } from "node:stream";

type SendRequest = (
  url: URL,
  options: RequestOptions,
  receive: (response: IncomingMessage) => void,
) => ClientRequest;

export function createPublicRouterFetch(send: SendRequest = request): typeof fetch {
  const agent = new Agent({
    keepAlive: true,
    maxSockets: 16,
    maxTotalSockets: 16,
    maxFreeSockets: 4,
    timeout: 4000,
  });
  let active = 0;
  return async (input, init) => {
    const endpoint = typeof input === "string" ? input : input instanceof URL ? input.href : null;
    if (
      endpoint === null ||
      !["http://127.0.0.1:4000/graphql", "http://router:4000/graphql"].includes(endpoint) ||
      init?.method !== "POST" ||
      typeof init.body !== "string" ||
      Buffer.byteLength(init.body) > 65536 ||
      active >= 16
    ) {
      throw new Error("Public Router request rejected.");
    }
    const timeout = AbortSignal.timeout(4000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    signal.throwIfAborted();
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        active--;
      }
    };
    return new Promise<Response>((resolve, reject) => {
      try {
        const outgoing = send(
          new URL(endpoint),
          {
            method: "POST",
            agent,
            signal,
            maxHeaderSize: 16384,
            // Node fetch discards Host. Preserve the exact public Router boundary without forwarding browser headers.
            headers: {
              host: "127.0.0.1:4000",
              origin: "http://127.0.0.1:4000",
              "x-aster-csrf": "1",
              "content-type": "application/json",
              accept: "application/json",
            },
          },
          (incoming) => {
            incoming.once("close", release);
            if (incoming.statusCode !== 200) {
              incoming.destroy();
              reject(new Error("Catalog is temporarily unavailable."));
              return;
            }
            resolve(
              new Response(
                Readable.toWeb(incoming, {
                  strategy: { highWaterMark: 65536, size: (chunk: Uint8Array) => chunk.byteLength },
                }) as ReadableStream<Uint8Array>,
                {
                  status: 200,
                  headers: { "content-type": incoming.headers["content-type"] ?? "" },
                },
              ),
            );
          },
        );
        outgoing.once("error", () => {
          release();
          reject(new Error("Catalog is temporarily unavailable."));
        });
        outgoing.end(init.body);
      } catch {
        release();
        reject(new Error("Catalog is temporarily unavailable."));
      }
    });
  };
}
