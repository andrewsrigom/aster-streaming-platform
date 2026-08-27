"use client";

import type { PropsWithChildren } from "react";
import { ApolloLink, HttpLink, Observable } from "@apollo/client";
import {
  ApolloClient,
  ApolloNextAppProvider,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import { publicCachePolicies } from "./policies";
import { boundedGraphqlFetch } from "./transport";

function makeClient() {
  return new ApolloClient({
    cache: new InMemoryCache({ typePolicies: publicCachePolicies }),
    link:
      typeof window === "undefined"
        ? new ApolloLink(
            () =>
              new Observable((observer) => {
                observer.error(new Error("Public SSR queries must be preloaded."));
              }),
          )
        : new HttpLink({
            uri: "http://127.0.0.1:4000/graphql",
            fetch: boundedGraphqlFetch(),
            headers: { "x-aster-csrf": "1" },
          }),
  });
}

export function GraphqlProvider({ children }: PropsWithChildren) {
  return <ApolloNextAppProvider makeClient={makeClient}>{children}</ApolloNextAppProvider>;
}
