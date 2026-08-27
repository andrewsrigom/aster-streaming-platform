import type { IdentityAccount, StoredIdentitySession } from "../../domain/session.js";

export function invalidIdentityRow(): never {
  throw new Error("Identity persistence contract failed.");
}

export function identityRow(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidIdentityRow();
  }
  return value as Record<string, unknown>;
}

export function identityText(value: unknown, maximum: number, pattern?: RegExp): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    (pattern && !pattern.test(value))
  ) {
    return invalidIdentityRow();
  }
  return value;
}

export function identityUuid(value: unknown): string {
  return identityText(
    value,
    36,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
}

export function identitySeconds(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,13}$/.test(value)) {
    return invalidIdentityRow();
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 8_640_000_000_000) {
    return invalidIdentityRow();
  }
  return number;
}

export function identityInteger(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return invalidIdentityRow();
  }
  return value;
}

export function readIdentityAccount(value: unknown): IdentityAccount {
  const item = identityRow(value);
  return Object.freeze({
    id: identityUuid(item["account_id"]),
    issuer: identityText(item["issuer"], 256),
    subject: identityText(item["subject"], 256),
  });
}

export function readIdentitySession(value: unknown): StoredIdentitySession {
  const item = identityRow(value);
  const result: StoredIdentitySession = Object.freeze({
    id: identityUuid(item["id"]),
    account: readIdentityAccount(item),
    signerId: identityUuid(item["signer_id"]),
    credentialDigest: identityText(item["credential_digest"], 64, /^[a-f0-9]{64}$/),
    issuedAt: identitySeconds(item["issued_at"]),
    expiresAt: identitySeconds(item["expires_at"]),
  });
  if (result.expiresAt <= result.issuedAt || result.expiresAt - result.issuedAt > 1_800) {
    return invalidIdentityRow();
  }
  return result;
}
