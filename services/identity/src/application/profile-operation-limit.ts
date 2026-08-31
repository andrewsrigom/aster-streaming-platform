import type { createIdentityProfiles } from "./profiles.js";
import type { createIdentitySessions } from "./sessions.js";
import type { ProfileRequest, ProfileResult } from "./profile-ports.js";
import {
  normalizeProfilePreferences,
  profileIdentifier,
  profileInput,
  profileVersion,
  type ProfilePolicy,
} from "../domain/profile.js";

export type IdentityLimitedProfileOperation = "profile_mutation" | "profile_selection";

export type IdentityProfileOperationAdmission =
  | Readonly<{ status: "allowed" }>
  | Readonly<{ status: "rejected"; retryAfterMs: number }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "unavailable" }>;

interface IdentityProfileOperationLimiter {
  admit(
    operation: IdentityLimitedProfileOperation,
    accountId: string,
    admissionId: string,
    signal: AbortSignal,
  ): Promise<IdentityProfileOperationAdmission>;
}

export interface RateLimitedIdentityProfilesOptions {
  readonly profiles: ReturnType<typeof createIdentityProfiles>;
  readonly sessions: Pick<ReturnType<typeof createIdentitySessions>, "restore">;
  readonly limiter: IdentityProfileOperationLimiter;
  readonly nextId: () => string;
  readonly digest: (value: string) => string;
  readonly policy: ProfilePolicy;
}

type MutationKind = "create" | "update" | "delete";

function mutationAdmissionIdentity(
  kind: MutationKind,
  value: unknown,
  policy: ProfilePolicy,
  digest: (value: string) => string,
): string | undefined {
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
  const requestedId = kind === "create" ? null : input["profileId"];
  const expectedVersion = kind === "create" ? null : input["expectedVersion"];
  if (kind !== "create" && (!profileIdentifier(requestedId) || !profileVersion(expectedVersion))) {
    return undefined;
  }
  const preferences =
    kind === "delete" ? undefined : normalizeProfilePreferences(input["profile"], policy);
  if (kind !== "delete" && !preferences) {
    return undefined;
  }
  const requestDigest = digest(
    JSON.stringify([kind, requestedId, expectedVersion, preferences ?? null]),
  );
  return /^[a-f0-9]{64}$/u.test(requestDigest)
    ? `${input["mutationId"]}\0${requestDigest}`
    : undefined;
}

export function createRateLimitedIdentityProfiles(options: RateLimitedIdentityProfilesOptions) {
  const admitted = async <T>(
    operation: IdentityLimitedProfileOperation,
    request: ProfileRequest,
    admissionIdentity: () => string | undefined,
    invoke: () => Promise<ProfileResult<T>>,
  ): Promise<ProfileResult<T>> => {
    const cancelled = (): boolean => request.signal.aborted;
    if (cancelled()) {
      return { status: "cancelled" };
    }
    try {
      const session = await options.sessions.restore(request.credential, request.signal);
      if (session.status !== "completed") {
        return { status: session.status };
      }
      if (cancelled()) {
        return { status: "cancelled" };
      }
      const identity = admissionIdentity();
      if (!identity) {
        return { status: "invalid_input" };
      }
      const admissionId = options.digest(`${operation}\0${identity}`);
      if (!/^[a-f0-9]{64}$/u.test(admissionId)) {
        return { status: "unavailable" };
      }
      const admission = await options.limiter.admit(
        operation,
        session.value.accountId,
        admissionId,
        request.signal,
      );
      if (cancelled() || admission.status === "cancelled") {
        return { status: "cancelled" };
      }
      if (admission.status === "rejected") {
        return { status: "limit_exceeded" };
      }
      if (admission.status !== "allowed") {
        return { status: "unavailable" };
      }
      return await invoke();
    } catch {
      return { status: cancelled() ? "cancelled" : "unavailable" };
    }
  };

  return Object.freeze({
    ...options.profiles,
    create: (request: ProfileRequest, input: unknown) =>
      admitted(
        "profile_mutation",
        request,
        () => mutationAdmissionIdentity("create", input, options.policy, options.digest),
        () => options.profiles.create(request, input),
      ),
    update: (request: ProfileRequest, input: unknown) =>
      admitted(
        "profile_mutation",
        request,
        () => mutationAdmissionIdentity("update", input, options.policy, options.digest),
        () => options.profiles.update(request, input),
      ),
    delete: (request: ProfileRequest, input: unknown) =>
      admitted(
        "profile_mutation",
        request,
        () => mutationAdmissionIdentity("delete", input, options.policy, options.digest),
        () => options.profiles.delete(request, input),
      ),
    select: (request: ProfileRequest, profileId: unknown) =>
      admitted(
        "profile_selection",
        request,
        () => options.nextId(),
        () => options.profiles.select(request, profileId),
      ),
  });
}
