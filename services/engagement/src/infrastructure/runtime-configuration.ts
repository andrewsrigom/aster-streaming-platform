import { isAsterOtlpMetricsEndpoint } from "@aster/telemetry";

const RUNTIME_FIELDS = new Set([
  "ASTER_ENGAGEMENT_LOCAL_ENABLED",
  "ASTER_ENGAGEMENT_HTTP_HOST",
  "ASTER_ENGAGEMENT_HTTP_PORT",
  "ASTER_ENGAGEMENT_DATABASE_URL",
  "ASTER_ENGAGEMENT_DATABASE_PASSWORD",
  "ASTER_ENGAGEMENT_RATE_LIMIT_ENABLED",
]);

export function localEngagementDatabase(
  environment: Readonly<Record<string, string | undefined>>,
  mode: "runtime" | "migration",
): string {
  if (
    environment["ASTER_ENVIRONMENT"] !== "local" ||
    environment[
      mode === "runtime" ? "ASTER_ENGAGEMENT_LOCAL_ENABLED" : "ASTER_ENGAGEMENT_MIGRATION_ENABLED"
    ] !== "true"
  ) {
    throw new Error("Local Engagement activation rejected.");
  }
  const prefix =
    mode === "runtime" ? "ASTER_ENGAGEMENT_DATABASE" : "ASTER_ENGAGEMENT_ADMIN_DATABASE";
  const source = environment[prefix + "_URL"];
  const pw = environment[prefix + "_PASSWORD"];
  if (
    !source ||
    source.length > 2048 ||
    /\s/u.test(source) ||
    !pw ||
    pw.length > 1024 ||
    /[\p{Cc}\p{Cs}]/u.test(pw)
  ) {
    throw new Error("Invalid local Engagement database.");
  }
  try {
    const url = new URL(source);
    if (
      url.protocol !== "postgresql:" ||
      !["127.0.0.1", "[::1]", "postgres"].includes(url.hostname) ||
      url.pathname !== "/aster" ||
      url.hash ||
      url.search ||
      url.password ||
      url.username !== (mode === "runtime" ? "aster_engagement_local" : "aster") ||
      (url.port !== "" && (Number(url.port) < 1024 || Number(url.port) > 65535))
    ) {
      throw new Error("Invalid database configuration.");
    }
    url.password = pw;
    return url.toString();
  } catch {
    throw new Error("Invalid local Engagement database.");
  }
}

export function engagementRuntimeConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    Object.keys(environment).some(
      (key) => key.startsWith("ASTER_ENGAGEMENT_") && !RUNTIME_FIELDS.has(key),
    )
  ) {
    throw new Error("Unsupported Engagement runtime configuration.");
  }
  const host = environment["ASTER_ENGAGEMENT_HTTP_HOST"] ?? "127.0.0.1";
  const port = environment["ASTER_ENGAGEMENT_HTTP_PORT"] ?? "3400";
  const distributedRateLimit = environment["ASTER_ENGAGEMENT_RATE_LIMIT_ENABLED"];
  const redisUrl = environment["REDIS_URL"];
  const otlpMetricsEndpoint = environment["ASTER_OTLP_METRICS_ENDPOINT"];
  if (
    (host !== "127.0.0.1" && host !== "0.0.0.0") ||
    !/^[1-9][0-9]{3,4}$/u.test(port) ||
    Number(port) < 1024 ||
    Number(port) > 65535 ||
    (distributedRateLimit !== undefined &&
      distributedRateLimit !== "true" &&
      distributedRateLimit !== "false") ||
    (distributedRateLimit === "true" && (typeof redisUrl !== "string" || redisUrl.length === 0)) ||
    environment["ASTER_ROUTER_TRUST_ENABLED"] !== "true" ||
    (otlpMetricsEndpoint !== undefined && !isAsterOtlpMetricsEndpoint(otlpMetricsEndpoint))
  ) {
    throw new Error("Invalid protected Engagement listener configuration.");
  }
  const validatedHost: "127.0.0.1" | "0.0.0.0" = host;
  const base = {
    host: validatedHost,
    port: Number(port),
    connectionString: localEngagementDatabase(environment, "runtime"),
    events: localEventDeliveryEnabled(
      environment["ASTER_EVENTS_ENABLED"],
      environment["ASTER_ENVIRONMENT"],
    ),
    ...(otlpMetricsEndpoint === undefined ? {} : { otlpMetricsEndpoint }),
  };
  return distributedRateLimit === "true"
    ? Object.freeze({ ...base, distributedRateLimit: true as const, redisUrl: redisUrl as string })
    : Object.freeze({ ...base, distributedRateLimit: false as const });
}
import { localEventDeliveryEnabled } from "@aster/event-delivery";
