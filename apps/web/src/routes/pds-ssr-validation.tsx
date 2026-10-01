import { useEffect } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import type { PdsSsrValidationMode } from "../features/pds/ssr-validation.ts";
import {
  createPdsSsrValidationClient,
  pdsSsrValidationQuery,
} from "../features/pds/ssr-validation.ts";

export const Route = createFileRoute("/pds-ssr-validation")({
  component: PdsSsrValidation,
  errorComponent: PdsSsrValidationError,
  validateSearch: (search): { mode: PdsSsrValidationMode } => ({
    mode: search.mode === "error" ? "error" : "success",
  }),
  loaderDeps: ({ search }) => ({ mode: search.mode }),
  loader: async ({ context, deps }) => {
    const { client, pdsQueryClient } = createPdsSsrValidationClient(deps.mode);
    const disconnect = pdsQueryClient.connect(context.queryClient);
    try {
      await context.queryClient.ensureQueryData(
        pdsSsrValidationQuery(deps.mode),
      );
    } finally {
      disconnect();
      await client.close();
    }
  },
});

function PdsSsrValidation() {
  const { mode } = Route.useSearch();
  const queryClient = useQueryClient();
  const query = useSuspenseQuery(pdsSsrValidationQuery(mode));

  useEffect(() => {
    const { client, pdsQueryClient } = createPdsSsrValidationClient(mode);
    const disconnect = pdsQueryClient.connect(queryClient);
    return () => {
      disconnect();
      void client.close();
    };
  }, [mode, queryClient]);

  return (
    <main data-pds-ssr-state={query.data.status}>
      <h1>PDS SSR success</h1>
      {query.data.result.map((message) => (
        <p data-pds-message={message.messageId} key={message.messageId}>
          {message.body}
        </p>
      ))}
    </main>
  );
}

function PdsSsrValidationError({ error }: { error: Error }) {
  return (
    <main data-pds-ssr-state="error">
      <h1>PDS SSR error boundary</h1>
      <p>{error.message}</p>
    </main>
  );
}
