type ParsedCookie = Readonly<{ credential: string | undefined }>;
const COOKIE_NAME = "aster_local_session";
const MAX_CREDENTIAL_BYTES = 3800;
const COMPACT_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const HEADER_NAME = /^[!#$%&'*+\-.^_\x60|~0-9A-Za-z]+$/u;
const COOKIE_VALUE =
  /^(?:"[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*"|[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*)$/u;

export function parseLocalSessionCookie(raw: string | undefined): ParsedCookie | undefined {
  if (raw === undefined) {
    return { credential: undefined };
  }
  if (raw.length === 0 || raw.length > 8_192) {
    return undefined;
  }
  const pairs = raw.split(";");
  if (pairs.length > 32) {
    return undefined;
  }
  const names = new Set<string>();
  let credential: string | undefined;
  for (const pair of pairs) {
    const field = pair.trim();
    const equals = field.indexOf("=");
    const name = field.slice(0, equals);
    const value = field.slice(equals + 1);
    if (
      equals < 1 ||
      name.length > 128 ||
      !HEADER_NAME.test(name) ||
      !COOKIE_VALUE.test(value) ||
      names.has(name)
    ) {
      return undefined;
    }
    names.add(name);
    if (name === COOKIE_NAME) {
      if (value.length > MAX_CREDENTIAL_BYTES || !COMPACT_JWT.test(value)) {
        return undefined;
      }
      credential = value;
    }
  }
  return { credential };
}
