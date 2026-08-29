import { localEventDeliveryEnabled } from "@aster/event-delivery";

const RUNTIME_FIELDS = new Set([
  "ASTER_DISCOVERY_LOCAL_ENABLED",
  "ASTER_DISCOVERY_HTTP_HOST",
  "ASTER_DISCOVERY_HTTP_PORT",
  "ASTER_DISCOVERY_DATABASE_URL",
  "ASTER_DISCOVERY_DATABASE_PASSWORD",
  "ASTER_DISCOVERY_PROJECTOR_DATABASE_URL",
  "ASTER_DISCOVERY_PROJECTOR_DATABASE_PASSWORD",
  "ASTER_DISCOVERY_CACHE_ENABLED",
]);

export function localDiscoveryDatabase(
  environment: Readonly<Record<string, string | undefined>>,
  mode: "runtime" | "projector" | "migration",
): string {
  if (
    environment["ASTER_ENVIRONMENT"] !== "local" ||
    environment[
      mode === "migration" ? "ASTER_DISCOVERY_MIGRATION_ENABLED" : "ASTER_DISCOVERY_LOCAL_ENABLED"
    ] !== "true"
  ) {
    throw new Error("Local Discovery activation rejected.");
  }
  const prefix =
    mode === "migration"
      ? "ASTER_DISCOVERY_ADMIN_DATABASE"
      : mode === "projector"
        ? "ASTER_DISCOVERY_PROJECTOR_DATABASE"
        : "ASTER_DISCOVERY_DATABASE";
  const source = environment[prefix + "_URL"];
  const pw = environment[prefix + "_PASSWORD"];
  if (
    !source ||
    source.length > 2_048 ||
    /\s/u.test(source) ||
    !pw ||
    pw.length > 1_024 ||
    /[\p{Cc}\p{Cs}]/u.test(pw)
  ) {
    throw new Error("Invalid local Discovery database.");
  }
  try {
    const url = new URL(source);
    const username =
      mode === "migration"
        ? "aster"
        : mode === "projector"
          ? "aster_discovery_projector_local"
          : "aster_discovery_local";
    if (
      url.protocol !== "postgresql:" ||
      !["127.0.0.1", "[::1]", "postgres"].includes(url.hostname) ||
      url.pathname !== "/aster" ||
      url.hash ||
      url.search ||
      url.password ||
      url.username !== username ||
      (url.port !== "" && (Number(url.port) < 1_024 || Number(url.port) > 65_535))
    ) {
      throw new Error("Invalid database configuration.");
    }
    url.password = pw;
    return url.toString();
  } catch {
    throw new Error("Invalid local Discovery database.");
  }
}

export function discoveryRuntimeConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    Object.keys(environment).some(
      (key) => key.startsWith("ASTER_DISCOVERY_") && !RUNTIME_FIELDS.has(key),
    )
  ) {
    throw new Error("Unsupported Discovery runtime configuration.");
  }
  const host = environment["ASTER_DISCOVERY_HTTP_HOST"] ?? "127.0.0.1";
  const port = environment["ASTER_DISCOVERY_HTTP_PORT"] ?? "3500";
  const cacheEnabled = environment["ASTER_DISCOVERY_CACHE_ENABLED"];
  const redisUrl = environment["REDIS_URL"];
  if (
    (host !== "127.0.0.1" && host !== "0.0.0.0") ||
    !/^[1-9][0-9]{3,4}$/u.test(port) ||
    Number(port) < 1_024 ||
    Number(port) > 65_535 ||
    (cacheEnabled !== undefined && cacheEnabled !== "true" && cacheEnabled !== "false") ||
    (cacheEnabled === "true" && (typeof redisUrl !== "string" || redisUrl.length === 0)) ||
    environment["ASTER_ROUTER_TRUST_ENABLED"] !== "true" ||
    !localEventDeliveryEnabled(
      environment["ASTER_EVENTS_ENABLED"],
      environment["ASTER_ENVIRONMENT"],
    )
  ) {
    throw new Error("Invalid protected Discovery runtime configuration.");
  }
  const validatedHost: "127.0.0.1" | "0.0.0.0" = host;
  const base = {
    environment: "local" as const,
    host: validatedHost,
    port: Number(port),
    connectionString: localDiscoveryDatabase(environment, "runtime"),
    projectorConnectionString: localDiscoveryDatabase(environment, "projector"),
  };
  return cacheEnabled === "true"
    ? Object.freeze({ ...base, cache: true as const, redisUrl: redisUrl as string })
    : Object.freeze({ ...base, cache: false as const });
}
