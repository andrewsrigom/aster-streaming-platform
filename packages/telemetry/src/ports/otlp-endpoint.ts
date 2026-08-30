export function isAsterOtlpMetricsEndpoint(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2_048 ||
    value !== value.trim()
  ) {
    return false;
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return false;
    }
  }
  try {
    const endpoint = new URL(value);
    return (
      (endpoint.protocol === "http:" || endpoint.protocol === "https:") &&
      endpoint.hostname.length > 0 &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash &&
      endpoint.pathname.endsWith("/v1/metrics")
    );
  } catch {
    return false;
  }
}
