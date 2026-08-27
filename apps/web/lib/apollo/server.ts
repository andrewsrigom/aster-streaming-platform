import "server-only";
import { notFound } from "next/navigation";
import { HttpLink } from "@apollo/client";
import {
  ApolloClient,
  InMemoryCache,
  registerApolloClient,
} from "@apollo/client-integration-nextjs";
import { publicCachePolicies } from "./policies";
import { boundedGraphqlFetch } from "./transport";
import { createPublicRouterFetch } from "./server-transport";
import { browseVariables } from "./operations";

export function readBrowseVariables(input: Record<string, string | string[] | undefined>) {
  try {
    return browseVariables(input);
  } catch {
    notFound();
  }
}

// Share bounded sockets, never the request-scoped Apollo cache.
const serverFetch = boundedGraphqlFetch(createPublicRouterFetch());

function routerUrl(): string {
  const uri = process.env["ASTER_WEB_ROUTER_URL"] ?? "http://127.0.0.1:4000/graphql";
  if (!["http://127.0.0.1:4000/graphql", "http://router:4000/graphql"].includes(uri)) {
    throw new Error("Invalid local Web Router endpoint.");
  }
  return uri;
}

export const { PreloadQuery } = registerApolloClient(
  () =>
    new ApolloClient({
      cache: new InMemoryCache({ typePolicies: publicCachePolicies }),
      link: new HttpLink({
        uri: routerUrl(),
        fetch: serverFetch,
        fetchOptions: { cache: "no-store" },
      }),
    }),
);
