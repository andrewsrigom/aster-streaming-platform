export function localCatalogDatabase(
  environment: Readonly<Record<string, string | undefined>>,
  mode: "operator" | "migration" | "reader",
): string {
  if (
    environment["ASTER_ENVIRONMENT"] !== "local" ||
    environment[
      mode === "reader" ? "ASTER_CATALOG_LOCAL_ENABLED" : "ASTER_CATALOG_OPERATOR_ENABLED"
    ] !== "true"
  ) {
    throw new Error("Local Catalog activation rejected.");
  }
  const prefix =
    mode === "reader"
      ? "ASTER_CATALOG_READER_DATABASE"
      : mode === "operator"
        ? "ASTER_CATALOG_DATABASE"
        : "ASTER_CATALOG_ADMIN_DATABASE";
  const field = prefix + "_URL";
  const source = environment[field];
  const pwd = environment[prefix + "_PASSWORD"];
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
    url.username !==
      (mode === "reader"
        ? "aster_catalog_reader_local"
        : mode === "operator"
          ? "aster_catalog_local"
          : "aster") ||
    url.password !== "" ||
    (url.port !== "" && (Number(url.port) < 1024 || Number(url.port) > 65535))
  ) {
    throw new Error("Invalid local Catalog database.");
  }
  url.password = pwd;
  return url.toString();
}
