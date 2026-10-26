import assert from "node:assert/strict";
import test from "node:test";
import type { PdsQueryData } from "@decentralized-convex/client";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import type { Note } from "./test-fixtures.ts";
import { PdsQueryClient } from "./pds-query-client.ts";
import { pdsQuery } from "./pds.ts";
import { listNotes, memoryTransport, nextTask, wait } from "./test-fixtures.ts";

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
  await wait(120);
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
