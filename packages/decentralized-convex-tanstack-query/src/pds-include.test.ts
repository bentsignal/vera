import assert from "node:assert/strict";
import test from "node:test";
import type { PdsQueryData } from "@decentralized-convex/client";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import type { Note } from "./test-fixtures.ts";
import { PdsQueryClient } from "./pds-query-client.ts";
import { pdsQuery } from "./pds.ts";
import {
  listNotes,
  memoryTransport,
  nextTask,
  until,
} from "./test-fixtures.ts";

void test("a query's first answer comes with what it includes, before its subscription's", async () => {
  // The subscription answers at once; the one-shot fetch, with what the
  // result includes, a moment later.
  const { connections, transport } = memoryTransport("a.test", {
    queryAfter: 30,
  });
  const queryClient = new QueryClient();
  const disconnect = new PdsQueryClient(transport).connect(queryClient);
  const options = pdsQuery({
    args: { owner: "with-included" },
    options: { revealPartialResultsAfter: 0 },
    query: listNotes,
  });
  const included = pdsQuery({
    args: { owner: "included" },
    options: { revealPartialResultsAfter: 0 },
    query: listNotes,
  });
  const observer = new QueryObserver(queryClient, options);
  const unsubscribe = observer.subscribe(() => undefined);
  await nextTask();
  // Held: shown without what it includes, it would change once that came.
  assert.equal(
    queryClient.getQueryData<PdsQueryData<Note[], readonly Note[]>>(
      options.queryKey,
    )?.status,
    "loading",
  );
  // Its home and its route each take that long.
  await until(
    () =>
      queryClient.getQueryData<PdsQueryData<Note[], readonly Note[]>>(
        options.queryKey,
      )?.status === "success",
  );
  const shown = queryClient.getQueryData<PdsQueryData<Note[], readonly Note[]>>(
    options.queryKey,
  );
  assert.equal(shown?.status, "success");
  assert.equal(
    queryClient.getQueryData<PdsQueryData<Note[], readonly Note[]>>(
      included.queryKey,
    )?.status,
    "success",
  );
  // The subscription asked without what's included.
  const subscribed = connections.get("https://a.test")?.subscribed[0];
  assert.equal(Reflect.get(Object(subscribed), "include"), false);
  // And it keeps the result up to date after that.
  connections.get("https://a.test")?.emit("live");
  await nextTask();
  const live = queryClient.getQueryData<PdsQueryData<Note[], readonly Note[]>>(
    options.queryKey,
  );
  assert.ok(
    live?.status === "success" &&
      live.result.some((note) => note.body === "live"),
  );
  unsubscribe();
  disconnect();
});

void test("a query watched before what includes it arrives takes the included answer", async () => {
  // Its own first answers are slow; the query that includes it answers
  // first.
  const { transport } = memoryTransport("a.test", {
    answerAfter: 300,
    queryAfter: (owner) => (owner === "included" ? 300 : 20),
  });
  const queryClient = new QueryClient();
  const disconnect = new PdsQueryClient(transport).connect(queryClient);
  const options = { revealPartialResultsAfter: 0 };
  const included = new QueryObserver(
    queryClient,
    pdsQuery({ args: { owner: "included" }, options, query: listNotes }),
  );
  const unsubscribeIncluded = included.subscribe(() => undefined);
  const withIncluded = new QueryObserver(
    queryClient,
    pdsQuery({ args: { owner: "with-included" }, options, query: listNotes }),
  );
  const unsubscribe = withIncluded.subscribe(() => undefined);
  const includedQuery = pdsQuery({
    args: { owner: "included" },
    options,
    query: listNotes,
  });
  await until(() => withIncluded.getCurrentResult().data?.status === "success");
  const shown = queryClient.getQueryData<PdsQueryData<Note[], readonly Note[]>>(
    includedQuery.queryKey,
  );
  assert.ok(
    shown?.status === "success" &&
      shown.result.some((note) => note.body === "included"),
  );
  unsubscribe();
  unsubscribeIncluded();
  disconnect();
});
