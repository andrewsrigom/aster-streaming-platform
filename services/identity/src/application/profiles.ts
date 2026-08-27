import { createProfileEvent, validProfileEventContext } from "../domain/profile-event.js";
import {
  MAX_ACCOUNT_PROFILES,
  PROFILE_RETENTION,
  normalizeProfilePreferences,
  profileIdentifier,
  profileInput,
  profileVersion,
  sameProfilePreferences,
  type ViewerProfile,
} from "../domain/profile.js";
import { sessionMatchesAssertion } from "../domain/session.js";

import type {
  IdentityProfilePorts,
  IdentityProfileTransaction,
  ProfileMutationResult,
  ProfileRequest,
  ProfileResult,
  ProfileSession,
} from "./profile-ports.js";

const RECEIPT_LIMIT = PROFILE_RETENTION.maximumReceipts;
const JOURNAL_LIMIT = PROFILE_RETENTION.maximumJournalEntries;
const RECEIPT_LIFETIME = PROFILE_RETENTION.receiptSeconds;
type MutationKind = "create" | "update" | "delete";

export function createIdentityProfiles(ports: IdentityProfilePorts) {
  const now = (): number => {
    const value = ports.now();
    if (!Number.isSafeInteger(value) || value < 0 || value > 253_402_300_799 - RECEIPT_LIFETIME) {
      throw new Error("Identity clock unavailable.");
    }
    return value;
  };
  const nextId = (): string => {
    const value = ports.nextId();
    if (!profileIdentifier(value)) {
      throw new Error("Identity identifier unavailable.");
    }
    return value;
  };
  const digest = (value: string): string => {
    const hashed = ports.digest(value);
    if (!/^[a-f0-9]{64}$/.test(hashed)) {
      throw new Error("Identity digest unavailable.");
    }
    return hashed;
  };

  const run = async <T>(
    request: ProfileRequest,
    operation: (
      tx: IdentityProfileTransaction,
      session: ProfileSession,
    ) => Promise<ProfileResult<T>>,
  ): Promise<ProfileResult<T>> => {
    const cancelled = (): boolean => request.signal.aborted;
    if (cancelled()) {
      return { status: "cancelled" };
    }
    try {
      if (!validProfileEventContext(request.context)) {
        return { status: "invalid_input" };
      }
      if (typeof request.credential !== "string") {
        return { status: "unauthenticated" };
      }
      const verified = await ports.identity.verify(request.credential, request.signal);
      if (verified.status !== "completed") {
        return {
          status: verified.status === "invalid_input" ? "unauthenticated" : verified.status,
        };
      }
      const credentialDigest = digest(request.credential);
      return await ports.transactions.run(async (tx) => {
        const account = await tx.lockAccount(verified.value);
        if (!account) {
          return { status: "unauthenticated" };
        }
        const session = await tx.lockSession(verified.value.sessionId);
        if (
          !session ||
          session.account.id !== account.id ||
          !sessionMatchesAssertion(session, verified.value, credentialDigest, ports.signerId, now())
        ) {
          return { status: "unauthenticated" };
        }
        const result = await operation(tx, session);
        // Crossing absolute expiry while queued or writing must not commit an authorized mutation.
        return now() < session.expiresAt ? result : { status: "unauthenticated" };
      }, request.signal);
    } catch {
      return { status: cancelled() ? "cancelled" : "unavailable" };
    }
  };

  const owned = async (
    tx: IdentityProfileTransaction,
    accountId: string,
    id: string,
  ): Promise<ViewerProfile | undefined> => {
    const profile = await tx.findProfile(accountId, id);
    return profile?.accountId === accountId && profile.id === id ? profile : undefined;
  };

  const mutate = (
    kind: MutationKind,
    request: ProfileRequest,
    value: unknown,
  ): Promise<ProfileResult<ProfileMutationResult>> =>
    run(request, async (tx, session) => {
      const input = profileInput(
        value,
        kind === "create"
          ? ["mutationId", "profile"]
          : kind === "update"
            ? ["mutationId", "profileId", "expectedVersion", "profile"]
            : ["mutationId", "profileId", "expectedVersion"],
      );
      if (!input || !profileIdentifier(input["mutationId"])) {
        return { status: "invalid_input" };
      }
      const mutationId = input["mutationId"];
      const requestedId = kind === "create" ? null : input["profileId"];
      const expectedVersion = kind === "create" ? null : input["expectedVersion"];
      if (
        kind !== "create" &&
        (!profileIdentifier(requestedId) || !profileVersion(expectedVersion))
      ) {
        return { status: "invalid_input" };
      }
      const preferences =
        kind === "delete" ? undefined : normalizeProfilePreferences(input["profile"], ports.policy);
      if (kind !== "delete" && !preferences) {
        return { status: "invalid_input" };
      }
      const requestDigest = digest(
        JSON.stringify([kind, requestedId, expectedVersion, preferences ?? null]),
      );
      const accountId = session.account.id;
      const timestamp = now();
      await tx.pruneReceiptsAndAudit(accountId, timestamp);
      const receipt = await tx.findReceipt(accountId, mutationId, timestamp);
      if (receipt) {
        if (
          receipt.accountId !== accountId ||
          receipt.mutationId !== mutationId ||
          receipt.requestDigest !== requestDigest
        ) {
          return { status: "conflict" };
        }
        return { status: "completed", value: receipt.result };
      }
      const counts = await tx.retainedCounts(accountId);
      if (
        [counts.receipts, counts.audit, counts.outbox].some(
          (count) => !Number.isSafeInteger(count) || count < 0,
        )
      ) {
        return { status: "unavailable" };
      }
      if (counts.receipts >= RECEIPT_LIMIT) {
        return { status: "backpressure" };
      }

      let profile: ViewerProfile;
      let changed = true;
      if (kind === "create") {
        const current = await tx.listProfiles(accountId);
        if (current.some((item) => item.accountId !== accountId)) {
          return { status: "unavailable" };
        }
        if (current.length >= ports.policy.maximumProfiles) {
          return { status: "limit_exceeded" };
        }
        if (!preferences) {
          return { status: "invalid_input" };
        }
        profile = Object.freeze({ ...preferences, id: nextId(), accountId, version: 1 });
      } else {
        // The branches above validated these primitive inputs before persistence receives them.
        const current = await owned(tx, accountId, requestedId as string);
        if (!current) {
          return { status: "not_found" };
        }
        if (current.version !== expectedVersion) {
          return { status: "conflict" };
        }
        changed =
          kind === "delete" || !preferences || !sameProfilePreferences(current, preferences);
        if (changed && current.version === 2_147_483_647) {
          return { status: "conflict" };
        }
        profile = Object.freeze({
          ...current,
          ...preferences,
          version: current.version + (changed ? 1 : 0),
        });
      }
      if (changed && (counts.audit >= JOURNAL_LIMIT || counts.outbox >= JOURNAL_LIMIT)) {
        return { status: "backpressure" };
      }
      if (changed) {
        if (kind === "create") {
          await tx.insertProfile(profile);
        } else if (kind === "update") {
          if (!(await tx.updateProfile(profile, expectedVersion as number))) {
            return { status: "conflict" };
          }
        } else {
          if (!(await tx.deleteProfile(accountId, profile.id, expectedVersion as number))) {
            return { status: "conflict" };
          }
          await tx.clearSelectedProfile(accountId, profile.id);
        }
        const event = createProfileEvent({
          eventId: nextId(),
          eventType:
            kind === "create"
              ? "identity.profile-created"
              : kind === "update"
                ? "identity.profile-updated"
                : "identity.profile-deleted",
          accountId,
          profileId: profile.id,
          version: profile.version,
          now: timestamp,
          context: request.context,
        });
        await tx.appendAudit(event);
        await tx.appendOutbox(event);
      }
      const result = Object.freeze({ profileId: profile.id, version: profile.version });
      await tx.writeReceipt({
        accountId,
        mutationId,
        requestDigest,
        result,
        expiresAt: timestamp + RECEIPT_LIFETIME,
      });
      return { status: "completed", value: result };
    });

  return Object.freeze({
    create: (request: ProfileRequest, input: unknown) => mutate("create", request, input),
    update: (request: ProfileRequest, input: unknown) => mutate("update", request, input),
    delete: (request: ProfileRequest, input: unknown) => mutate("delete", request, input),
    list: (request: ProfileRequest) =>
      run(request, async (tx, session) => {
        const profiles = await tx.listProfiles(session.account.id);
        if (
          profiles.length > MAX_ACCOUNT_PROFILES ||
          profiles.some((item) => item.accountId !== session.account.id)
        ) {
          return { status: "unavailable" };
        }
        return {
          status: "completed",
          value: Object.freeze({ profiles, activeProfileId: session.activeProfileId }),
        };
      }),
    get: (request: ProfileRequest, profileId: unknown) =>
      run(request, async (tx, session) => {
        if (!profileIdentifier(profileId)) {
          return { status: "invalid_input" };
        }
        const profile = await owned(tx, session.account.id, profileId);
        return profile ? { status: "completed", value: profile } : { status: "not_found" };
      }),
    select: (request: ProfileRequest, profileId: unknown) =>
      run(request, async (tx, session) => {
        if (!profileIdentifier(profileId)) {
          return { status: "invalid_input" };
        }
        const profile = await owned(tx, session.account.id, profileId);
        if (!profile) {
          return { status: "not_found" };
        }
        if (session.activeProfileId !== profile.id) {
          await tx.selectProfile(session.account.id, session.id, profile.id);
        }
        return { status: "completed", value: profile };
      }),
    active: (request: ProfileRequest, profileId: unknown) =>
      run(request, async (tx, session) => {
        if (!profileIdentifier(profileId)) {
          return { status: "invalid_input" };
        }
        if (session.activeProfileId !== profileId) {
          return { status: "not_found" };
        }
        const profile = await owned(tx, session.account.id, profileId);
        return profile ? { status: "completed", value: profile } : { status: "not_found" };
      }),
  });
}
