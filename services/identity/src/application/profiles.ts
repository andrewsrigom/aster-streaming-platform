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
export type ProfileMutationKind = "create" | "update" | "delete";

export type ProfileMutationReplayProbe =
  | Readonly<{
      kind: "missing";
      accountId: string;
      admissionIdentity: string;
    }>
  | Readonly<{
      kind: "replay";
      result: ProfileMutationResult;
    }>;

function profileEventType(kind: ProfileMutationKind) {
  if (kind === "create") {
    return "identity.profile-created" as const;
  }
  if (kind === "update") {
    return "identity.profile-updated" as const;
  }
  return "identity.profile-deleted" as const;
}

export function createIdentityProfiles(ports: IdentityProfilePorts) {
  const currentIdentityTime = (): number => {
    const value = ports.now();
    if (!Number.isSafeInteger(value) || value < 0 || value > 253_402_300_799 - RECEIPT_LIFETIME) {
      throw new Error("Identity clock unavailable.");
    }
    return value;
  };
  const nextIdentityIdentifier = (): string => {
    const value = ports.nextId();
    if (!profileIdentifier(value)) {
      throw new Error("Identity identifier unavailable.");
    }
    return value;
  };
  const digestIdentityValue = (value: string): string => {
    const hashed = ports.digest(value);
    if (!/^[a-f0-9]{64}$/.test(hashed)) {
      throw new Error("Identity digest unavailable.");
    }
    return hashed;
  };

  const normalizeProfileMutationInput = (kind: ProfileMutationKind, value: unknown) => {
    const input = profileInput(
      value,
      kind === "create"
        ? ["mutationId", "profile"]
        : kind === "update"
          ? ["mutationId", "profileId", "expectedVersion", "profile"]
          : ["mutationId", "profileId", "expectedVersion"],
    );
    if (!input || !profileIdentifier(input["mutationId"])) {
      return undefined;
    }
    const mutationId = input["mutationId"];
    const requestedId = kind === "create" ? null : input["profileId"];
    const expectedVersion = kind === "create" ? null : input["expectedVersion"];
    if (
      kind !== "create" &&
      (!profileIdentifier(requestedId) || !profileVersion(expectedVersion))
    ) {
      return undefined;
    }
    const preferences =
      kind === "delete" ? undefined : normalizeProfilePreferences(input["profile"], ports.policy);
    if (kind !== "delete" && !preferences) {
      return undefined;
    }
    const requestDigest = digestIdentityValue(
      JSON.stringify([kind, requestedId, expectedVersion, preferences ?? null]),
    );
    return Object.freeze({
      mutationId,
      requestedId,
      expectedVersion,
      preferences,
      requestDigest,
      admissionIdentity: `${mutationId}\0${requestDigest}`,
    });
  };

  const runAuthorizedProfileTransaction = async <T>(
    request: ProfileRequest,
    authorizedOperation: (
      tx: IdentityProfileTransaction,
      session: ProfileSession,
    ) => Promise<ProfileResult<T>>,
  ): Promise<ProfileResult<T>> => {
    const requestIsCancelled = (): boolean => request.signal.aborted;
    if (requestIsCancelled()) {
      return { status: "cancelled" };
    }

    try {
      if (!validProfileEventContext(request.context)) {
        return { status: "invalid_input" };
      }
      if (typeof request.credential !== "string") {
        return { status: "unauthenticated" };
      }

      const identityVerification = await ports.identity.verify(request.credential, request.signal);
      if (identityVerification.status !== "completed") {
        return {
          status:
            identityVerification.status === "invalid_input"
              ? "unauthenticated"
              : identityVerification.status,
        };
      }

      const credentialDigest = digestIdentityValue(request.credential);
      return await ports.transactions.run(async (tx) => {
        const lockedAccount = await tx.lockAccount(identityVerification.value);
        if (!lockedAccount) {
          return { status: "unauthenticated" };
        }

        const lockedSession = await tx.lockSession(identityVerification.value.sessionId);
        if (
          !lockedSession ||
          lockedSession.account.id !== lockedAccount.id ||
          !sessionMatchesAssertion(
            lockedSession,
            identityVerification.value,
            credentialDigest,
            ports.signerId,
            currentIdentityTime(),
          )
        ) {
          return { status: "unauthenticated" };
        }

        const operationResult = await authorizedOperation(tx, lockedSession);
        // Crossing absolute expiry while queued or writing must not commit an authorized mutation.
        return currentIdentityTime() < lockedSession.expiresAt
          ? operationResult
          : { status: "unauthenticated" };
      }, request.signal);
    } catch {
      return { status: requestIsCancelled() ? "cancelled" : "unavailable" };
    }
  };

  const findOwnedProfile = async (
    tx: IdentityProfileTransaction,
    accountId: string,
    id: string,
  ): Promise<ViewerProfile | undefined> => {
    const profile = await tx.findProfile(accountId, id);
    return profile?.accountId === accountId && profile.id === id ? profile : undefined;
  };

  const applyProfileMutation = (
    kind: ProfileMutationKind,
    request: ProfileRequest,
    value: unknown,
  ): Promise<ProfileResult<ProfileMutationResult>> =>
    runAuthorizedProfileTransaction(request, async (tx, session) => {
      const mutation = normalizeProfileMutationInput(kind, value);
      if (!mutation) {
        return { status: "invalid_input" };
      }
      const { mutationId, requestedId, expectedVersion, preferences, requestDigest } = mutation;
      const accountId = session.account.id;
      const mutationTime = currentIdentityTime();

      await tx.pruneReceiptsAndAudit(accountId, mutationTime);
      const existingReceipt = await tx.findReceipt(accountId, mutationId, mutationTime);
      if (existingReceipt) {
        if (
          existingReceipt.accountId !== accountId ||
          existingReceipt.mutationId !== mutationId ||
          existingReceipt.requestDigest !== requestDigest
        ) {
          return { status: "conflict" };
        }
        return { status: "completed", value: existingReceipt.result };
      }

      const retainedCounts = await tx.retainedCounts(accountId);
      if (
        [retainedCounts.receipts, retainedCounts.audit, retainedCounts.outbox].some(
          (count) => !Number.isSafeInteger(count) || count < 0,
        )
      ) {
        return { status: "unavailable" };
      }
      if (retainedCounts.receipts >= RECEIPT_LIMIT) {
        return { status: "backpressure" };
      }

      let nextProfileState: ViewerProfile;
      let profileChanged = true;
      if (kind === "create") {
        const currentProfiles = await tx.listProfiles(accountId);
        if (currentProfiles.some((profile) => profile.accountId !== accountId)) {
          return { status: "unavailable" };
        }
        if (currentProfiles.length >= ports.policy.maximumProfiles) {
          return { status: "limit_exceeded" };
        }
        if (!preferences) {
          return { status: "invalid_input" };
        }
        nextProfileState = Object.freeze({
          ...preferences,
          id: nextIdentityIdentifier(),
          accountId,
          version: 1,
        });
      } else {
        // The branches above validated these primitive inputs before persistence receives them.
        const ownedProfile = await findOwnedProfile(tx, accountId, requestedId as string);
        if (!ownedProfile) {
          return { status: "not_found" };
        }
        if (ownedProfile.version !== expectedVersion) {
          return { status: "conflict" };
        }
        profileChanged =
          kind === "delete" || !preferences || !sameProfilePreferences(ownedProfile, preferences);
        if (profileChanged && ownedProfile.version === 2_147_483_647) {
          return { status: "conflict" };
        }
        nextProfileState = Object.freeze({
          ...ownedProfile,
          ...preferences,
          version: ownedProfile.version + (profileChanged ? 1 : 0),
        });
      }

      if (
        profileChanged &&
        (retainedCounts.audit >= JOURNAL_LIMIT || retainedCounts.outbox >= JOURNAL_LIMIT)
      ) {
        return { status: "backpressure" };
      }

      if (profileChanged) {
        if (kind === "create") {
          await tx.insertProfile(nextProfileState);
        } else if (kind === "update") {
          if (!(await tx.updateProfile(nextProfileState, expectedVersion as number))) {
            return { status: "conflict" };
          }
        } else {
          if (
            !(await tx.deleteProfile(accountId, nextProfileState.id, expectedVersion as number))
          ) {
            return { status: "conflict" };
          }
          await tx.clearSelectedProfile(accountId, nextProfileState.id);
        }

        const profileEvent = createProfileEvent({
          eventId: nextIdentityIdentifier(),
          eventType: profileEventType(kind),
          accountId,
          profileId: nextProfileState.id,
          version: nextProfileState.version,
          now: mutationTime,
          context: request.context,
        });
        await tx.appendAudit(profileEvent);
        await tx.appendOutbox(profileEvent);
      }

      const mutationResult = Object.freeze({
        profileId: nextProfileState.id,
        version: nextProfileState.version,
      });
      await tx.writeReceipt({
        accountId,
        mutationId,
        requestDigest,
        result: mutationResult,
        expiresAt: mutationTime + RECEIPT_LIFETIME,
      });
      return { status: "completed", value: mutationResult };
    });

  return Object.freeze({
    probeMutationReplay: (
      kind: ProfileMutationKind,
      request: ProfileRequest,
      value: unknown,
    ): Promise<ProfileResult<ProfileMutationReplayProbe>> =>
      runAuthorizedProfileTransaction<ProfileMutationReplayProbe>(request, async (tx, session) => {
        const mutation = normalizeProfileMutationInput(kind, value);
        if (!mutation) {
          return { status: "invalid_input" };
        }
        const probeTime = currentIdentityTime();
        const existingReceipt = await tx.findReceipt(
          session.account.id,
          mutation.mutationId,
          probeTime,
        );
        if (!existingReceipt) {
          return {
            status: "completed",
            value: Object.freeze({
              kind: "missing",
              accountId: session.account.id,
              admissionIdentity: mutation.admissionIdentity,
            }),
          };
        }
        if (
          existingReceipt.accountId !== session.account.id ||
          existingReceipt.mutationId !== mutation.mutationId ||
          existingReceipt.requestDigest !== mutation.requestDigest
        ) {
          return { status: "conflict" };
        }
        return {
          status: "completed",
          value: Object.freeze({ kind: "replay", result: existingReceipt.result }),
        };
      }),
    authorize: (request: ProfileRequest, profileId: unknown) =>
      runAuthorizedProfileTransaction(request, async (tx, session) => {
        if (!profileIdentifier(profileId)) {
          return { status: "invalid_input" };
        }
        const ownedProfile = await findOwnedProfile(tx, session.account.id, profileId);
        return ownedProfile
          ? {
              status: "completed",
              value: Object.freeze({
                accountId: session.account.id,
                profileId: ownedProfile.id,
                checkedAt: currentIdentityTime(),
                expiresAt: session.expiresAt,
              }),
            }
          : { status: "not_found" };
      }),
    create: (request: ProfileRequest, input: unknown) =>
      applyProfileMutation("create", request, input),
    update: (request: ProfileRequest, input: unknown) =>
      applyProfileMutation("update", request, input),
    delete: (request: ProfileRequest, input: unknown) =>
      applyProfileMutation("delete", request, input),
    list: (request: ProfileRequest) =>
      runAuthorizedProfileTransaction(request, async (tx, session) => {
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
      runAuthorizedProfileTransaction(request, async (tx, session) => {
        if (!profileIdentifier(profileId)) {
          return { status: "invalid_input" };
        }
        const ownedProfile = await findOwnedProfile(tx, session.account.id, profileId);
        return ownedProfile
          ? { status: "completed", value: ownedProfile }
          : { status: "not_found" };
      }),
    select: (request: ProfileRequest, profileId: unknown) =>
      runAuthorizedProfileTransaction(request, async (tx, session) => {
        if (!profileIdentifier(profileId)) {
          return { status: "invalid_input" };
        }
        const ownedProfile = await findOwnedProfile(tx, session.account.id, profileId);
        if (!ownedProfile) {
          return { status: "not_found" };
        }
        if (session.activeProfileId !== ownedProfile.id) {
          await tx.selectProfile(session.account.id, session.id, ownedProfile.id);
        }
        return { status: "completed", value: ownedProfile };
      }),
    active: (request: ProfileRequest, profileId: unknown) =>
      runAuthorizedProfileTransaction(request, async (tx, session) => {
        if (!profileIdentifier(profileId)) {
          return { status: "invalid_input" };
        }
        if (session.activeProfileId !== profileId) {
          return { status: "not_found" };
        }
        const ownedProfile = await findOwnedProfile(tx, session.account.id, profileId);
        return ownedProfile
          ? { status: "completed", value: ownedProfile }
          : { status: "not_found" };
      }),
  });
}
