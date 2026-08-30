"use client";

import { useEffect, type PropsWithChildren } from "react";
import { ApolloNextAppProvider } from "@apollo/client-integration-nextjs";
import { createPublicApolloClient } from "./client";

export function GraphqlProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    performance.mark("aster.web.hydrated");
  }, []);
  return (
    <ApolloNextAppProvider makeClient={createPublicApolloClient}>{children}</ApolloNextAppProvider>
  );
}
