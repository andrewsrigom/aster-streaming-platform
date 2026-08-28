export function catalogIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value)
  );
}

export function catalogVersion(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647
  );
}

export function catalogTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 253_402_300_799
  );
}

export function catalogText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value &&
    !/[\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]/u.test(value)
  );
}

export function catalogUrl(value: unknown): value is string {
  if (!catalogText(value, 2048)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      url.search === "" &&
      url.href === value
    );
  } catch {
    return false;
  }
}

export function catalogChecksum(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

export function catalogMediaUrl(value: unknown, kind: "manifest" | "artwork"): value is string {
  if (catalogUrl(value)) {
    return true;
  }
  if (!catalogText(value, 2048)) {
    return false;
  }
  const prefix =
    /^http:\/\/127\.0\.0\.1:9001\/aster-media-published\/publications\/[a-f0-9]{64}\//u;
  if (!prefix.test(value)) {
    return false;
  }
  const filename = value.replace(prefix, "");
  return kind === "manifest"
    ? filename === "master.m3u8"
    : /^(?:poster-(?:[1-9][0-9]{0,2})|thumbnail-0[1-3])\.jpg$/u.test(filename);
}

export function catalogRecord(
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
      names.length !== keys.length ||
      names.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      return undefined;
    }
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor)) {
        return undefined;
      }
      result[key] = descriptor.value as unknown;
    }
    return result;
  } catch {
    return undefined;
  }
}
