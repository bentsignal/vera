import assert from "node:assert/strict";
import test from "node:test";
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";

import { PdsQueryClient } from "./pds-query-client.ts";
import { pdsMutation, pdsQuery, pdsSessionQueryKey } from "./pds.ts";
import {
  createNote,
  listNotes,
  memoryTransport,
  nextTask,
} from "./test-fixtures.ts";

void test("account sessions share one QueryClient without mixing", async () => {
  const alice = memoryTransport("a.test");
  const bob = memoryTransport("b.test");
  const queryClient = new QueryClient();
  const disconnectAlice = new PdsQueryClient(alice.transport, {
    session: "alice",
  }).connect(queryClient);
  const disconnectBob = new PdsQueryClient(bob.transport, {
    session: "bob",
  }).connect(queryClient);
  assert.throws(() =>
    new PdsQueryClient(bob.transport, { session: "bob" }).connect(queryClient),
  );

  function notesAs(session: string) {
    return pdsQuery({
      args: { owner: session },
      options: { revealPartialResultsAfter: 0 },
      query: listNotes,
      session,
    });
  }
  assert.deepEqual(notesAs("bob").queryKey.slice(0, 4), [
    ...pdsSessionQueryKey("bob"),
  ]);

  const aliceNotes = await queryClient.fetchQuery(notesAs("alice"));
  const bobNotes = await queryClient.fetchQuery(notesAs("bob"));
  assert.equal(aliceNotes.status, "success");
  assert.equal(bobNotes.status, "success");
  assert.deepEqual(
    aliceNotes.result.map((note) => note.body),
    ["https://a.test", "https://b.test"],
  );
  assert.deepEqual(
    bobNotes.result.map((note) => note.body),
    ["https://b.test"],
  );

  const observer = new QueryObserver(queryClient, notesAs("bob"));
  const unsubscribe = observer.subscribe(() => undefined);
  await nextTask();
  bob.connections.get("https://b.test")?.emit("bob's update");
  await nextTask();
  const updated = observer.getCurrentResult().data;
  assert.ok(updated);
  assert.equal(updated.status, "success");
  assert.deepEqual(updated.result, [{ body: "bob's update", id: "bob" }]);

  const sent = await new MutationObserver(
    queryClient,
    pdsMutation({ mutation: createNote, session: "bob" }),
  ).mutate({ body: "hi" });
  assert.equal(sent.id, "https://b.test");
  await assert.rejects(
    new MutationObserver(
      queryClient,
      pdsMutation({ mutation: createNote, session: "carol" }),
    ).mutate({ body: "hi" }),
  );

  unsubscribe();
  disconnectAlice();
  disconnectBob();
  await alice.transport.close();
  await bob.transport.close();
});
