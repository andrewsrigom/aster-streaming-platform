import type { ValidatedIdentityAssertion } from "../domain/identity-assertion.js";
import type { ProfileEvent, ProfileEventContext } from "../domain/profile-event.js";
import type { ProfilePolicy, ViewerProfile } from "../domain/profile.js";
import type { IdentityAccount, StoredIdentitySession } from "../domain/session.js";

import type { IdentitySessionPorts, SessionResult } from "./session-ports.js";

export type ProfileResult<T> =
  | SessionResult<T>
  | Readonly<{ status: "invalid_input" | "not_found" | "conflict" | "backpressure" }>;

export interface ProfileMutationResult {
  readonly profileId: string;
  readonly version: number;
}

export interface ProfileMutationReceipt {
  readonly accountId: string;
  readonly mutationId: string;
  readonly requestDigest: string;
  readonly result: ProfileMutationResult;
  readonly expiresAt: number;
}

export interface ProfileSession extends StoredIdentitySession {
  readonly activeProfileId: string | null;
}

export interface IdentityProfileTransaction {
  lockAccount(
    identity: Pick<ValidatedIdentityAssertion, "issuer" | "subject">,
  ): Promise<IdentityAccount | undefined>;
  lockSession(sessionId: string): Promise<ProfileSession | undefined>;
  listProfiles(accountId: string): Promise<readonly ViewerProfile[]>;
  findProfile(accountId: string, profileId: string): Promise<ViewerProfile | undefined>;
  insertProfile(profile: ViewerProfile): Promise<void>;
  updateProfile(profile: ViewerProfile, expectedVersion: number): Promise<boolean>;
  deleteProfile(accountId: string, profileId: string, expectedVersion: number): Promise<boolean>;
  selectProfile(accountId: string, sessionId: string, profileId: string): Promise<void>;
  clearSelectedProfile(accountId: string, profileId: string): Promise<void>;
  pruneReceiptsAndAudit(accountId: string, now: number): Promise<void>;
  findReceipt(
    accountId: string,
    mutationId: string,
    now: number,
  ): Promise<ProfileMutationReceipt | undefined>;
  retainedCounts(
    accountId: string,
  ): Promise<Readonly<{ receipts: number; audit: number; outbox: number }>>;
  writeReceipt(receipt: ProfileMutationReceipt): Promise<void>;
  appendAudit(event: ProfileEvent): Promise<void>;
  appendOutbox(event: ProfileEvent): Promise<void>;
}

export interface IdentityProfileUnitOfWork {
  run<T>(
    operation: (transaction: IdentityProfileTransaction) => Promise<ProfileResult<T>>,
    signal: AbortSignal,
  ): Promise<ProfileResult<T>>;
}

export interface ProfileRequest {
  readonly credential: unknown;
  readonly signal: AbortSignal;
  readonly context: ProfileEventContext;
}

export interface IdentityProfilePorts {
  readonly identity: Pick<IdentitySessionPorts["identity"], "verify">;
  readonly transactions: IdentityProfileUnitOfWork;
  readonly policy: ProfilePolicy;
  readonly signerId: string;
  readonly nextId: () => string;
  readonly now: () => number;
  readonly digest: (value: string) => string;
}
