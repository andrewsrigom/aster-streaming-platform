export interface IdentityEventRecord {
  readonly topic: string;
  readonly partition: number;
  readonly offset: string;
  readonly key: Uint8Array | null;
  readonly value: Uint8Array;
  readonly headers: Readonly<Record<string, Uint8Array>>;
}
export interface IdentityFact {
  readonly eventId: string;
  readonly accountId: string;
  readonly profileId: string;
  readonly version: number;
  readonly occurredAt: number;
  readonly deleted: boolean;
  readonly correlationId: string;
}
type IdentityPoisonReason = "signature" | "envelope" | "identity_conflict";
export type IdentityEventInspection =
  | Readonly<{ status: "valid"; fact: IdentityFact; record: IdentityEventRecord }>
  | Readonly<{ status: "poison"; reason: IdentityPoisonReason; record: IdentityEventRecord }>
  | Readonly<{ status: "oversized" }>;
export interface IdentityEventStore {
  deleteProfile(
    fact: IdentityFact,
    signal: AbortSignal,
  ): Promise<"applied" | "duplicate" | "conflict" | "full" | "unavailable">;
  quarantine(
    record: IdentityEventRecord,
    reason: IdentityPoisonReason,
    signal: AbortSignal,
  ): Promise<"stored" | "duplicate" | "full" | "unavailable">;
  readQuarantine(id: string, signal: AbortSignal): Promise<IdentityEventRecord | undefined>;
  completeReplay(id: string, signal: AbortSignal): Promise<boolean>;
}
export interface IdentityEventPorts {
  readonly inspect: (record: IdentityEventRecord) => IdentityEventInspection;
  readonly store: IdentityEventStore;
}
