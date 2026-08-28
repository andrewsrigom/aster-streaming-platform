import {
  MAX_MEDIA_REQUESTS_PER_TITLE,
  mediaRequestEligible,
  mediaRequestFingerprintInput,
  normalizeMediaRequest,
  normalizeMediaRequestInput,
  type CatalogMediaRequest,
} from "../domain/media-request.js";
import { catalogIdentifier, catalogTimestamp } from "../domain/values.js";
import type { CatalogMediaPorts } from "./media-ports.js";
import type { CatalogCommandRequest } from "./operator-ports.js";
import type { CatalogStoreResult } from "./rights-ports.js";

export function createCatalogMediaRequests(ports: CatalogMediaPorts) {
  return Object.freeze({
    async request(
      value: unknown,
      request: CatalogCommandRequest,
    ): Promise<CatalogStoreResult<CatalogMediaRequest>> {
      if (request.signal.aborted) {
        return { status: "cancelled" };
      }
      const now = ports.now();
      const actor = ports.authority.authorize(request.credential, now);
      if (!actor) {
        return { status: "unauthorized" };
      }
      const input = normalizeMediaRequestInput(value);
      if (!input || !catalogTimestamp(now) || !catalogIdentifier(request.correlationId)) {
        return { status: "invalid_input" };
      }
      return ports.transactions.run(async (tx) => {
        const title = await tx.lockTitle(input.titleId);
        if (!title) {
          return { status: "not_found" };
        }
        const rights = await tx.findRights(input.titleId, null);
        const eligible = (): boolean =>
          mediaRequestEligible(
            input,
            title,
            title.latestRightsRevision,
            rights?.record,
            ports.now(),
            ports.policy,
          );
        const finish = (result: CatalogMediaRequest): CatalogStoreResult<CatalogMediaRequest> => {
          if (request.signal.aborted) {
            return { status: "cancelled" };
          }
          if (ports.authority.authorize(request.credential, ports.now())?.id !== actor.id) {
            return { status: "unauthorized" };
          }
          return eligible()
            ? { status: "completed", value: result }
            : { status: "rights_not_approved" };
        };
        if (!eligible()) {
          return { status: "rights_not_approved" };
        }
        const previous = await tx.findMediaRequest(input.requestId);
        if (previous) {
          return previous.actorId === actor.id &&
            JSON.stringify(previous.input) === JSON.stringify(input)
            ? finish(previous)
            : { status: "conflict" };
        }
        if (title.version !== input.expectedVersion) {
          return { status: "conflict" };
        }
        const record = normalizeMediaRequest({
          input,
          actorId: actor.id,
          correlationId: request.correlationId,
          requestedAt: ports.now(),
          sourceFingerprint: ports.digest(mediaRequestFingerprintInput(input)),
        });
        if (!record) {
          return { status: "invalid_input" };
        }
        if (await tx.findMediaFingerprint(input.titleId, record.sourceFingerprint)) {
          return { status: "conflict" };
        }
        if ((await tx.countMediaRequests(input.titleId)) >= MAX_MEDIA_REQUESTS_PER_TITLE) {
          return { status: "backpressure" };
        }
        if (!(await tx.insertMediaRequest(record))) {
          return { status: "conflict" };
        }
        // The title lock prevents concurrent review changes; time and authority can still expire.
        return finish(record);
      }, request.signal);
    },
  });
}
