import { Resolver } from "node:dns/promises";
import https from "node:https";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { isIPv4 } from "node:net";
import type { Readable } from "node:stream";
import type { AcquisitionFailure } from "../../domain/media-acquisition.js";

export class MediaAcquisitionError extends Error {
  constructor(readonly code: AcquisitionFailure) {
    super(`Media acquisition failed: ${code}.`);
  }
}
export interface MediaSourceResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Readable;
}
export interface MediaSourceNetwork {
  open(url: URL, etag: string, signal: AbortSignal): Promise<MediaSourceResponse>;
}
export function publicMediaAddress(address: string): boolean {
  if (!isIPv4(address)) {
    return false;
  }
  const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function approvedMediaUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.href !== value ||
    url.protocol !== "https:" ||
    url.hostname !== "download.blender.org" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith("/peach/bigbuckbunny_movies/")
  ) {
    throw new MediaAcquisitionError("UNSAFE_SOURCE");
  }
  return url;
}
async function publicAddress(hostname: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const resolver = new Resolver({ timeout: 1000, tries: 1 });
  const cancel = () => {
    resolver.cancel();
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const addresses = await resolver.resolve4(hostname);
    signal.throwIfAborted();
    if (addresses.length < 1 || addresses.length > 8 || !addresses.every(publicMediaAddress)) {
      throw new MediaAcquisitionError("UNSAFE_SOURCE");
    }
    const address = addresses[0];
    if (address === undefined) {
      throw new MediaAcquisitionError("UNSAFE_SOURCE");
    }
    return address;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
export const mediaSourceNetwork: MediaSourceNetwork = {
  async open(url, etag, signal) {
    approvedMediaUrl(url.href);
    const address = await publicAddress(url.hostname, signal);
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      // Pin the checked address while HTTPS retains the original Host/SNI/certificate identity.
      const request = https.request(url, {
        method: "GET",
        agent: false,
        family: 4,
        signal,
        maxHeaderSize: 8192,
        lookup: (_hostname, _options, callback) => {
          callback(null, address, 4);
        },
        headers: { "If-Match": etag, "Accept-Encoding": "identity", "User-Agent": "Aster-Media/1" },
      });
      request.maxHeadersCount = 64;
      let body: IncomingMessage | undefined;
      const timeout = () => {
        const error = new MediaAcquisitionError("SOURCE_TIMEOUT");
        body?.destroy(error);
        request.destroy(error);
      };
      const connect = setTimeout(timeout, 5000);
      const headers = setTimeout(timeout, 10000);
      request.setTimeout(10000, timeout);
      request.once("socket", (socket) =>
        socket.once("secureConnect", () => {
          clearTimeout(connect);
        }),
      );
      request.once("response", (response) => {
        body = response;
        response.on("error", () => undefined);
        clearTimeout(connect);
        clearTimeout(headers);
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: response });
      });
      request.once("error", reject);
      request.once("close", () => {
        clearTimeout(connect);
        clearTimeout(headers);
      });
      request.end();
    });
  },
};
