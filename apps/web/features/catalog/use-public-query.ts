"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import type { OperationVariables, TypedDocumentNode } from "@apollo/client";
import { useApolloClient, useSuspenseQuery } from "@apollo/client/react";

export function usePublicQuery<TData, TVariables extends OperationVariables>(
  query: TypedDocumentNode<TData, TVariables>,
  variables: TVariables,
) {
  const client = useApolloClient();
  const explicitRequest = useRef(false);
  const asterExplicitRequest = useCallback(() => explicitRequest.current, []);
  const result = useSuspenseQuery(query, {
    variables,
    errorPolicy: "all",
    context: { asterExplicitRequest },
  });
  const [pending, startTransition] = useTransition();
  const data = result.error ? undefined : result.data;
  useEffect(() => {
    client.cache.gc();
  }, [client, data]);

  return {
    data,
    pending,
    refresh: () => {
      if (explicitRequest.current) {
        return;
      }
      explicitRequest.current = true;
      startTransition(async () => {
        try {
          // Query errors become rendered state; never leak a rejected event-handler promise.
          await result.refetch().catch(() => undefined);
        } finally {
          explicitRequest.current = false;
        }
      });
    },
  };
}
