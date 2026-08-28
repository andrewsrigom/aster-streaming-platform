import { createHmac, timingSafeEqual } from "node:crypto";
import { EVENT_TOPICS, MAX_EVENT_BYTES } from "../domain/envelope.js";

export const IDENTITY_EVENT_SIGNATURE = "aster-identity-event-signature";
export function createIdentityEventSignature(credential: string) {
  if (!/^[a-f0-9]{64}$/u.test(credential)) {
    throw new Error("Invalid Identity event credential.");
  }
  const keyBytes = Buffer.from(credential, "hex");
  const digest = (key: Uint8Array, value: Uint8Array) => {
    if (key.byteLength !== 36 || value.byteLength < 1 || value.byteLength > MAX_EVENT_BYTES) {
      throw new Error("Identity event exceeds wire bounds.");
    }
    return createHmac("sha256", keyBytes)
      .update("aster.identity-event.v1\0")
      .update(EVENT_TOPICS.identity)
      .update("\0")
      .update(key)
      .update("\0")
      .update(value)
      .digest("hex");
  };
  return Object.freeze({
    sign(key: Uint8Array, value: Uint8Array): Uint8Array {
      return Buffer.from(digest(key, value), "ascii");
    },
    verify(topic: string, key: Uint8Array, value: Uint8Array, signature: Uint8Array): boolean {
      if (topic !== EVENT_TOPICS.identity || signature.byteLength !== 64) {
        return false;
      }
      try {
        const text = Buffer.from(signature).toString("ascii");
        return (
          /^[a-f0-9]{64}$/u.test(text) &&
          timingSafeEqual(Buffer.from(digest(key, value), "ascii"), signature)
        );
      } catch {
        return false;
      }
    },
  });
}
