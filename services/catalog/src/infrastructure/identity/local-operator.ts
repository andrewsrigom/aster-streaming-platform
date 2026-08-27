import type { CatalogOperatorAuthority } from "../../application/operator-ports.js";
import { catalogIdentifier, catalogRecord, catalogTimestamp } from "../../domain/values.js";

export function createLocalCatalogOperator(configuration: unknown, issuedAt: number) {
  const input = catalogRecord(configuration, ["environment", "operatorEnabled", "actorId"]);
  if (
    !input ||
    input["environment"] !== "local" ||
    input["operatorEnabled"] !== true ||
    !catalogIdentifier(input["actorId"]) ||
    !catalogTimestamp(issuedAt) ||
    issuedAt > 253_402_298_999
  ) {
    throw new Error("Local Catalog operator activation rejected.");
  }
  const credential = Object.freeze(Object.create(null) as object);
  const operator = Object.freeze({ id: input["actorId"], expiresAt: issuedAt + 1800 });
  let active = true;
  const authority: CatalogOperatorAuthority = Object.freeze({
    authorize(value: unknown, now: number) {
      return active &&
        value === credential &&
        catalogTimestamp(now) &&
        now >= issuedAt &&
        now < operator.expiresAt
        ? operator
        : undefined;
    },
  });
  return Object.freeze({
    credential,
    authority,
    revoke: () => {
      active = false;
    },
  });
}
