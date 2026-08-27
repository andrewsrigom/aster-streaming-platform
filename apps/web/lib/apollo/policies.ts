import type { FieldPolicy, Reference, StoreObject, TypePolicies } from "@apollo/client";

type Result = StoreObject | Reference | null;
interface Snapshot {
  arguments: string;
  value: Result;
}
function oneSnapshot(keys: readonly string[]): FieldPolicy<Snapshot, Result> {
  const key = (args: Record<string, unknown> | null) =>
    JSON.stringify(keys.map((name) => args?.[name] ?? null));
  return {
    keyArgs: false,
    read(existing, { args }) {
      return existing?.arguments === key(args) ? existing.value : undefined;
    },
    merge(_existing, incoming, { args }) {
      return { arguments: key(args), value: incoming };
    },
  };
}

export const publicCachePolicies: TypePolicies = {
  Title: { keyFields: ["id"] },
  Profile: { keyFields: ["id"] },
  Query: {
    fields: {
      // Keep one page and one detail root; mounted consumers collect orphaned entities.
      titles: oneSnapshot(["first", "after"]),
      title: oneSnapshot(["id"]),
    },
  },
};
