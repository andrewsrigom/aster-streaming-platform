export function localCatalogDatabase(
  environment: Readonly<Record<string, string | undefined>>,
  mode: "operator" | "migration",
): string {
  if (
    environment["ASTER_ENVIRONMENT"] !== "local" ||
    environment["ASTER_CATALOG_OPERATOR_ENABLED"] !== "true"
  ) {
    throw new Error("Local Catalog activation rejected.");
  }
  const field =
    mode === "operator" ? "ASTER_CATALOG_DATABASE_URL" : "ASTER_CATALOG_ADMIN_DATABASE_URL";
  const source = environment[field];
  const pwd =
    environment[
      mode === "operator"
        ? "ASTER_CATALOG_DATABASE_PASSWORD"
        : "ASTER_CATALOG_ADMIN_DATABASE_PASSWORD"
    ];
  if (
    !source ||
    source.length > 2048 ||
    /\s/u.test(source) ||
    !pwd ||
    pwd.length > 1024 ||
    /[\p{Cc}\p{Cs}]/u.test(pwd)
  ) {
    throw new Error("Invalid local Catalog database.");
  }
  const url = new URL(source);
  if (
    url.protocol !== "postgresql:" ||
    !["127.0.0.1", "[::1]", "postgres"].includes(url.hostname) ||
    url.pathname !== "/aster" ||
    url.hash ||
    url.search ||
    url.username !== (mode === "operator" ? "aster_catalog_local" : "aster") ||
    url.password !== "" ||
    (url.port !== "" && (Number(url.port) < 1024 || Number(url.port) > 65535))
  ) {
    throw new Error("Invalid local Catalog database.");
  }
  url.password = pwd;
  return url.toString();
}
