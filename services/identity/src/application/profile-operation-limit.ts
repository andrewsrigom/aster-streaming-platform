import type { createIdentityProfiles } from "./profiles.js";
import type { createIdentitySessions } from "./sessions.js";
import type { ProfileRequest, ProfileResult } from "./profile-ports.js";

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
}

export function createRateLimitedIdentityProfiles(options: RateLimitedIdentityProfilesOptions) {
  const admitted = async <T>(
    operation: IdentityLimitedProfileOperation,
    request: ProfileRequest,
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
      const admissionId = options.digest(`${operation}\0${options.nextId()}`);
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
      admitted("profile_mutation", request, () => options.profiles.create(request, input)),
    update: (request: ProfileRequest, input: unknown) =>
      admitted("profile_mutation", request, () => options.profiles.update(request, input)),
    delete: (request: ProfileRequest, input: unknown) =>
      admitted("profile_mutation", request, () => options.profiles.delete(request, input)),
    select: (request: ProfileRequest, profileId: unknown) =>
      admitted("profile_selection", request, () => options.profiles.select(request, profileId)),
  });
}
