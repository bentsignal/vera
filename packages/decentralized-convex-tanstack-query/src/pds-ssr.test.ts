import assert from "node:assert/strict";
import test from "node:test";
import type {
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
  PdsRequest,
} from "@decentralized-convex/client";
import type { FunctionReturnType } from "convex/server";
import { QueryClient } from "@tanstack/react-query";
import { DecentralizedConvexClient } from "@decentralized-convex/client";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { decentralizedConvexPackage as corePackage } from "@decentralized-convex/core/metadata";

import { IncompletePdsQueryError, PdsQueryClient } from "./pds-query-client.ts";
import { pdsQuery } from "./pds.ts";

void test("strict queries reject when an initial PDS times out", async () => {
  const transport = new DecentralizedConvexClient({
    connectionFactory: () => new HangingConnection(),
    pds: { home: discoveredPds("a.test") },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const adapter = new PdsQueryClient(transport);
  const disconnect = adapter.connect(queryClient);

  await assert.rejects(
    queryClient.ensureQueryData(
      pdsQuery({
        args: { owner: "alice" },
        options: {
          initialResponseTimeout: 20,
          requireCompleteResults: true,
        },
        query: listNotes,
      }),
    ),
    (error: unknown) =>
      error instanceof IncompletePdsQueryError &&
      error.message.includes("did not return its initial result in time"),
  );

  disconnect();
  await transport.close();
});

function listNotes(args: { owner: string }) {
  return {
    lastChanged: corePackage.lastChanged,
    operation: { args, type: "list" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  } satisfies PdsRequest<readonly { body: string; id: string }[], "query">;
}

class HangingConnection implements FederationConnection {
  close() {
    return Promise.resolve();
  }

  mutation<Mutation extends FederationMutationReference>(): Promise<
    FunctionReturnType<Mutation>
  > {
    return Promise.reject(new Error("Not implemented"));
  }

  query<Query extends FederationQueryReference>(): Promise<
    FunctionReturnType<Query>
  > {
    return new Promise(() => undefined);
  }

  subscribe() {
    return () => undefined;
  }
}

function discoveredPds(domain: string) {
  return {
    domain,
    manifest: {
      accountDomain: domain,
      capabilities: [{ id: "notes", lastChanged: corePackage.lastChanged }],
      deploymentUrl: `https://${domain}`,
      httpUrl: `https://${domain}`,
      lastChanged: corePackage.lastChanged,
      version: DECENTRALIZED_CONVEX_VERSION,
    },
    manifestUrl: `https://${domain}/.well-known/pds.json`,
  };
}
