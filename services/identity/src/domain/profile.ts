export const MAX_ACCOUNT_PROFILES = 16;
export const PROFILE_RETENTION = Object.freeze({
  receiptSeconds: 86_400,
  auditSeconds: 30 * 86_400,
  maximumReceipts: 64,
  maximumJournalEntries: 128,
});
const PROFILE_MATURITY = Object.freeze(["GENERAL", "TEEN", "MATURE"] as const);
type ProfileMaturity = (typeof PROFILE_MATURITY)[number];

interface ProfilePreferences {
  readonly displayName: string;
  readonly locale: string;
  readonly maturity: ProfileMaturity;
  readonly avatarRef: null;
}

export interface ViewerProfile extends ProfilePreferences {
  readonly id: string;
  readonly accountId: string;
  readonly version: number;
}

export interface ProfilePolicy {
  readonly maximumProfiles: number;
  readonly supportedLocales: readonly string[];
}

export function profileIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
  );
}

export function profileVersion(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647
  );
}

export function profileInput(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return undefined;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Reflect.ownKeys(descriptors);
    if (
      names.length > keys.length ||
      names.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      return undefined;
    }
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const name of names) {
      const field = descriptors[name as string];
      if (!field || !("value" in field)) {
        return undefined;
      }
      result[name as string] = field.value as unknown;
    }
    return result;
  } catch {
    return undefined;
  }
}

function canonicalLocale(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length < 2 || value.length > 35) {
    return undefined;
  }
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

export function createProfilePolicy(
  options: Readonly<{ maximumProfiles?: number; supportedLocales?: readonly string[] }> = {},
): ProfilePolicy {
  const maximumProfiles = options.maximumProfiles ?? 5;
  const locales = options.supportedLocales ?? ["pt-BR", "en-US"];
  if (
    !Number.isSafeInteger(maximumProfiles) ||
    maximumProfiles < 1 ||
    maximumProfiles > MAX_ACCOUNT_PROFILES ||
    locales.length < 1 ||
    locales.length > 16
  ) {
    throw new Error("Invalid Identity profile policy.");
  }
  const canonical = locales.map(canonicalLocale);
  if (
    canonical.some((locale) => locale === undefined) ||
    new Set(canonical).size !== canonical.length
  ) {
    throw new Error("Invalid Identity profile policy.");
  }
  return Object.freeze({ maximumProfiles, supportedLocales: Object.freeze(canonical as string[]) });
}

export function normalizeProfilePreferences(
  value: unknown,
  policy: ProfilePolicy,
): ProfilePreferences | undefined {
  const input = profileInput(value, ["displayName", "locale", "maturity", "avatarRef"]);
  if (!input) {
    return undefined;
  }
  const name = input["displayName"];
  if (typeof name !== "string" || name.length > 256) {
    return undefined;
  }
  const displayName = name.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (
    displayName.length === 0 ||
    Array.from(displayName).length > 60 ||
    /[\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]/u.test(displayName)
  ) {
    return undefined;
  }
  const locale = canonicalLocale(input["locale"]);
  if (!locale || !policy.supportedLocales.includes(locale)) {
    return undefined;
  }
  const maturity = input["maturity"];
  if (!PROFILE_MATURITY.some((item) => item === maturity)) {
    return undefined;
  }
  if (input["avatarRef"] !== undefined && input["avatarRef"] !== null) {
    return undefined;
  }
  return Object.freeze({
    displayName,
    locale,
    maturity: maturity as ProfileMaturity,
    avatarRef: null,
  });
}

export function sameProfilePreferences(
  left: ProfilePreferences,
  right: ProfilePreferences,
): boolean {
  return (
    left.displayName === right.displayName &&
    left.locale === right.locale &&
    left.maturity === right.maturity
  );
}
