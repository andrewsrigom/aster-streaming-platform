import { Kind, type SelectionSetNode, type DocumentNode } from "graphql";
import { BROWSE, TITLE_DETAIL } from "./operations.ts";

function project(value: unknown, selection: SelectionSetNode | undefined): unknown {
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length > 20) {
      throw new Error("Public collection exceeds its bound.");
    }
    return value.map((entry: unknown) => project(entry, selection));
  }
  if (!selection) {
    if (typeof value === "string" && value.length <= 2048) {
      return value;
    }
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      return value;
    }
    throw new Error("Invalid public scalar.");
  }
  if (!value || typeof value !== "object") {
    throw new Error("Invalid public object.");
  }
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of selection.selections) {
    if (field.kind !== Kind.FIELD) {
      throw new Error("Unsupported public selection.");
    }
    const name = field.alias?.value ?? field.name.value;
    if (!Object.hasOwn(source, name)) {
      throw new Error("Incomplete public response.");
    }
    result[name] = project(source[name], field.selectionSet);
  }
  const typename = source["__typename"];
  if (typeof typename === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u.test(typename)) {
    result["__typename"] = typename;
  }
  return result;
}

export function projectPublicData(value: unknown, operationName: unknown): unknown {
  const document =
    operationName === "Browse"
      ? BROWSE
      : operationName === "TitleDetail"
        ? TITLE_DETAIL
        : undefined;
  if (!document) {
    throw new Error("Unknown public operation.");
  }
  return projectSelectedData(value, document);
}

export function projectSelectedData(value: unknown, document: DocumentNode): unknown {
  const operation = document.definitions[0];
  if (
    operation?.kind !== Kind.OPERATION_DEFINITION ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error("Unknown or invalid public operation response.");
  }
  return project(value, operation.selectionSet);
}
