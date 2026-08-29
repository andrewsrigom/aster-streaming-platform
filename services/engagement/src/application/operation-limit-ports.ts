export type EngagementLimitedOperation = "record_progress" | "set_watchlist";

export type EngagementOperationAdmission =
  | Readonly<{ status: "allowed" }>
  | Readonly<{ status: "rejected"; retryAfterMs: number }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "unavailable" }>;

export interface EngagementOperationLimiter {
  admit(
    operation: EngagementLimitedOperation,
    accountId: string,
    signal: AbortSignal,
  ): Promise<EngagementOperationAdmission>;
}
