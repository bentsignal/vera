import assert from "node:assert/strict";
import test from "node:test";
import type { PdsQueryData } from "@decentralized-convex/client";
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";

import type { Note } from "./test-fixtures.ts";
import { PdsQueryClient } from "./pds-query-client.ts";
import { pdsMutation, pdsQuery } from "./pds.ts";
import {
  createNote,
  listNotes,
  memoryTransport,
  nextTask,
} from "./test-fixtures.ts";

void test("produces native TanStack query and mutation options", async () => {
  const { connections, transport } = memoryTransport("a.test");
  const queryClient = new QueryClient();
  const adapter = new PdsQueryClient(transport);
  const disconnect = adapter.connect(queryClient);

  const query = pdsQuery({
    args: { owner: "alice" },
    options: { revealPartialResultsAfter: 0 },
    query: listNotes,
  });
  assert.equal("revealPartialResultsAfter" in query, false);
  const initialObserver = new QueryObserver(new QueryClient(), query);
  assert.deepEqual(initialObserver.getCurrentResult().data, {
    federation: { sources: [], status: "pending" },
    status: "loading",
  });

  const initial = await queryClient.fetchQuery(query);
  assert.equal(initial.status, "success");
  assert.deepEqual(initial.result, [
    { body: "https://a.test", id: "alice" },
    { body: "https://b.test", id: "alice" },
  ]);
  assert.equal(initial.federation.status, "success");
  assert.deepEqual(
    initial.federation.sources.map((source) => source.status),
    ["live", "live"],
  );

  const observer = new QueryObserver(queryClient, query);
  const unsubscribe = observer.subscribe(() => undefined);
  await nextTask();
  connections.get("https://a.test")?.emit("updated");
  await nextTask();
  const updated = queryClient.getQueryData<
    PdsQueryData<Note[], readonly Note[]>
  >(query.queryKey);
  assert.ok(updated);
  assert.equal(updated.status, "success");
  assert.deepEqual(updated.result, [
    { body: "updated", id: "alice" },
    { body: "https://b.test", id: "alice" },
  ]);
  assert.equal(updated.federation.status, "success");

  const mutation = new MutationObserver(
    queryClient,
    pdsMutation({ mutation: createNote }),
  );
  assert.deepEqual(await mutation.mutate({ body: "hello" }), {
    body: "hello",
    id: "https://a.test",
  });

  unsubscribe();
  disconnect();
  await transport.close();
});

void test("strict queries resolve only with complete initial data", async () => {
  const { connections, transport } = memoryTransport("a.test");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const adapter = new PdsQueryClient(transport);
  const disconnect = adapter.connect(queryClient);
  const query = pdsQuery({
    args: { owner: "alice" },
    options: { requireCompleteResults: true },
    query: listNotes,
  });

  assert.equal("initialData" in query, false);
  const result = await queryClient.ensureQueryData(query);
  assert.equal(result.status, "success");
  assert.deepEqual(result.result, [
    { body: "https://a.test", id: "alice" },
    { body: "https://b.test", id: "alice" },
  ]);

  const observer = new QueryObserver(queryClient, query);
  const unsubscribe = observer.subscribe(() => undefined);
  assert.equal(observer.getCurrentResult().data?.status, "success");
  await nextTask();
  connections.get("https://a.test")?.emit("Hydrated live update");
  await nextTask();
  const updated = observer.getCurrentResult().data;
  assert.ok(updated);
  assert.equal(updated.status, "success");
  assert.deepEqual(updated.result, [
    { body: "Hydrated live update", id: "alice" },
    { body: "https://b.test", id: "alice" },
  ]);

  unsubscribe();
  disconnect();
  await transport.close();
});

function usePdsQueryTypeTest() {
  const query = useQuery(
    pdsQuery({
      args: { owner: "alice" },
      options: { enabled: true },
      query: listNotes,
    }),
  );
  const data: PdsQueryData<Note[], readonly Note[]> = query.data;
  const source = query.data.federation.sources[0];
  if (source?.status === "live") {
    const notes: readonly Note[] = source.data;
    void notes;
  }
  return data;
}

void usePdsQueryTypeTest;

function useCompletePdsQueryTypeTest() {
  const query = useSuspenseQuery(
    pdsQuery({
      args: { owner: "alice" },
      options: { requireCompleteResults: true },
      query: listNotes,
    }),
  );
  const status: "success" = query.data.status;
  const notes: Note[] = query.data.result;
  return { notes, status };
}

void useCompletePdsQueryTypeTest;
