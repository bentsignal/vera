import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredPds } from "@decentralized-convex/address";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { decentralizedConvexPackage as corePackage } from "@decentralized-convex/core/metadata";

import type {
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
} from "./types.ts";
import { DecentralizedConvexClient } from "./client.ts";
import { listNotesRequest, note, notesApi } from "./notes.testing.ts";
import { UntrustedPdsAnswerError } from "./trust.ts";

// A conversation with members on a.test (home), b.test and liar.test,
// where liar.test's PDS answers with notes as other servers' accounts.

void test("leaves out what a PDS says about another server's accounts", async () => {
  const { client, connections } = federation();
  const observer = client.watchPdsQuery(listNotesRequest, {
    revealPartialResultsAfter: 0,
  });

  connections
    .get("https://a.test")
    ?.emit([note("a")], ["someone@b.test", "someone@liar.test"]);
  await wait(0);
  connections.get("https://b.test")?.emit([note("b")]);
  connections
    .get("https://liar.test")
    ?.emit([
      note("forged", "a.test"),
      note("forged", "b.test"),
      { author: "liar.test", body: "no account" },
      note("own", "liar.test"),
    ]);

  assert.deepEqual(observer.getSnapshot().data, [
    note("a"),
    note("b"),
    note("own", "liar.test"),
  ]);
  observer.close();
  await client.close();
});

void test("believes the home PDS only about its own accounts too", async () => {
  const { client, connections } = federation();
  const observer = client.watchPdsQuery(listNotesRequest);

  connections
    .get("https://a.test")
    ?.emit([note("a"), note("forged", "b.test")]);
  await wait(0);

  assert.deepEqual(observer.getSnapshot().data, [note("a")]);
  observer.close();
  await client.close();
});

void test("refuses other PDSs' answers to a query that doesn't say what they're believed about", async () => {
  const { client, connections } = federation();
  const observer = client.watchPdsQuery(notesApi.notes.queries.unchecked({}), {
    revealPartialResultsAfter: 0,
  });

  connections.get("https://a.test")?.emit([note("a")], ["someone@liar.test"]);
  await wait(0);
  connections.get("https://liar.test")?.emit([note("forged", "a.test")]);

  const snapshot = observer.getSnapshot();
  assert.deepEqual(snapshot.data, [note("a")]);
  const liar = snapshot.sources.find(
    (source) => source.target.url === "https://liar.test",
  );
  assert.ok(
    liar?.status === "error" && liar.error instanceof UntrustedPdsAnswerError,
  );
  observer.close();
  await client.close();
});

void test("refuses an answer the query's rule can't read", async () => {
  const { client, connections } = federation();
  const observer = client.watchPdsQuery(listNotesRequest, {
    revealPartialResultsAfter: 0,
  });

  connections.get("https://a.test")?.emit([note("a")], ["someone@liar.test"]);
  await wait(0);
  // Not a list: the rule throws, and nothing of it is shown.
  connections.get("https://liar.test")?.emit(
    // The liar sends what the protocol doesn't allow.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    { notes: [note("forged", "a.test")] } as unknown as [],
  );

  assert.deepEqual(observer.getSnapshot().data, [note("a")]);
  observer.close();
  await client.close();
});

void test("a manifest naming another domain's deployment is asked and believed apart from it", async () => {
  const { client, connections, tokensAskedFor } = federation({
    // liar.test's manifest names b.test's deployment as its own.
    liar: { deploymentUrl: "https://b.test" },
  });
  const observer = client.watchPdsQuery(listNotesRequest, {
    revealPartialResultsAfter: 0,
  });

  connections
    .get("https://a.test")
    ?.emit([note("a")], ["someone@liar.test", "someone@b.test"]);
  await wait(0);
  const forB = connections.get("https://b.test");
  const forLiar = connections.get("https://b.test#liar.test");
  assert.ok(forB !== undefined && forLiar !== undefined && forB !== forLiar);
  forB.emit([note("b")]);
  forLiar.emit([note("b")]);

  // b.test's own connection signs in for b.test, whichever was found first.
  await forB.signIn();
  await forLiar.signIn();
  assert.deepEqual(tokensAskedFor, ["b.test", "liar.test"]);
  // b.test's note, once: the copy through liar.test isn't believed.
  assert.deepEqual(observer.getSnapshot().data, [note("a"), note("b")]);
  observer.close();
  await client.close();
});

void test("caches included results only as far as the home PDS speaks for them", async () => {
  const { client, connections } = federation();
  const observer = client.watchPdsQuery(listNotesRequest);

  connections.get("https://a.test")?.emit(
    [note("a")],
    [],
    [
      {
        request: listNotesRequest,
        routes: ["someone@a.test"],
        value: [note("included", "a.test"), note("forged", "b.test")],
      },
    ],
  );
  await wait(0);

  assert.deepEqual(
    observer.getSnapshot().included?.map(({ snapshot }) => snapshot.data),
    [[note("included", "a.test")]],
  );
  observer.close();
  await client.close();
});

void test("refuses a PDS that discovery found for another domain", async () => {
  const client = new DecentralizedConvexClient({
    connectionFactory: () => new ControlledConnection(() => undefined),
    pds: {
      discover: () => Promise.resolve(discoveredPds("b.test")),
      home: discoveredPds("a.test"),
    },
  });
  await assert.rejects(client.resolvePds("someone@liar.test"));
  await client.close();
});

function federation(
  overrides: { liar?: Partial<DiscoveredPds["manifest"]> } = {},
) {
  const connections = new Map<string, ControlledConnection>();
  const tokensAskedFor: string[] = [];
  const client = new DecentralizedConvexClient({
    connectionFactory: (url, getAuthToken) => {
      const connection = new ControlledConnection(() =>
        getAuthToken?.({ forceRefreshToken: false, url }),
      );
      // The second connection to one deployment is the liar's.
      const key = connections.has(url) ? `${url}#liar.test` : url;
      connections.set(key, connection);
      return connection;
    },
    getAuthToken: ({ pds }) => {
      tokensAskedFor.push(pds?.domain ?? "none");
      return Promise.resolve("token");
    },
    pds: {
      discover: (address) => {
        const domain = address.slice(address.lastIndexOf("@") + 1);
        const found = discoveredPds(domain);
        return Promise.resolve(
          domain === "liar.test"
            ? { ...found, manifest: { ...found.manifest, ...overrides.liar } }
            : found,
        );
      },
      home: discoveredPds("a.test"),
    },
  });
  return { client, connections, tokensAskedFor };
}

class ControlledConnection implements FederationConnection {
  readonly #signIn;
  #publish?: (
    value: readonly { author: string; body: string }[],
    routes: readonly string[],
    included: readonly unknown[],
  ) => void;

  constructor(signIn: () => Promise<unknown> | undefined) {
    this.#signIn = signIn;
  }

  signIn() {
    return this.#signIn();
  }

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
    return Promise.reject(new Error("Not implemented"));
  }

  subscribe<Query extends FederationQueryReference>(
    _query: Query,
    _args: FunctionArgs<Query>,
    onResult: (result: FunctionReturnType<Query>) => void,
  ) {
    this.#publish = (value, routes, included) => {
      // The controlled connection only receives the PDS root query in this test.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      onResult({ included, routes, value } as FunctionReturnType<Query>);
    };
    return () => {
      this.#publish = undefined;
    };
  }

  emit(
    value: readonly { author: string; body: string }[],
    routes: readonly string[] = [],
    included: readonly unknown[] = [],
  ) {
    this.#publish?.(value, routes, included);
  }
}

function discoveredPds(domain: string): DiscoveredPds {
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

function wait(delay: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delay));
}
