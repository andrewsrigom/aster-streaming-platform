import "server-only";
import { HttpLink } from "@apollo/client";
import {
  ApolloClient,
  InMemoryCache,
  registerApolloClient,
} from "@apollo/client-integration-nextjs";
import { publicCachePolicies } from "./policies";
import { boundedGraphqlFetch } from "./transport";

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
        fetch: boundedGraphqlFetch(),
        headers: { host: "127.0.0.1:4000", origin: "http://127.0.0.1:4000", "x-aster-csrf": "1" },
        fetchOptions: { cache: "no-store" },
      }),
    }),
);
