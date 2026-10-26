import type { PdsQueryData } from "@decentralized-convex/tanstack-query";
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PdsInitialResponseTimeoutError } from "@decentralized-convex/client";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { ConvexError } from "convex/values";

import type { Page } from "~/features/messaging/window-pages";
import {
  latestPageQueries,
  useMessageWindow,
} from "~/features/messaging/message-window";
import { pageQuery } from "~/features/messaging/window-pages";

jest.mock("~/features/messaging/stay-live", () => ({ isLive: () => false }));

const SESSION = "me@vera.test";
const MISSING = "00000000-0000-4000-8000-000000000000";
const NOW = 100_000;
const PAGE = { hasNewer: false, hasOlder: false, messages: [] };
const clients = new Set<QueryClient>();

function failed(...errors: Error[]) {
  return {
    status: "error",
    error: new AggregateError(errors),
    federation: {
      status: "error",
      sources: errors.map((error, index) => ({
        status: "error",
        error,
        target: { ids: [`pds${index}`], url: `https://pds${index}.test` },
      })),
    },
  } satisfies PdsQueryData<Page[], Page>;
}

function success(page: Page) {
  return {
    status: "success",
    result: [page],
    federation: { status: "success", sources: [] },
  } satisfies PdsQueryData<Page[], Page>;
}

function directFailure(error: Error) {
  return {
    status: "error",
    error,
    federation: { status: "error", sources: [] },
  } satisfies PdsQueryData<Page[], Page>;
}

beforeEach(() => jest.spyOn(Date, "now").mockReturnValue(NOW));
afterEach(() => {
  for (const client of clients) client.clear();
  clients.clear();
  jest.restoreAllMocks();
});

async function openAtAnchor(initial?: PdsQueryData<Page[], Page>) {
  const client = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  clients.add(client);
  const source = {
    conversationId: expect.getState().currentTestName ?? "test",
  };
  const opening = pageQuery(SESSION, source, { around: MISSING });
  if (initial !== undefined) client.setQueryData(opening.queryKey, initial);
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  const rendered = await renderHook(
    () => useMessageWindow(SESSION, source, MISSING, NOW - 100),
    { wrapper: Wrapper },
  );
  return {
    ...rendered,
    client,
    source,
    answer: (data: PdsQueryData<Page[], Page>) =>
      act(async () => {
        client.setQueryData(opening.queryKey, data, { updatedAt: NOW + 1 });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }),
    close: async () => {
      await rendered.unmount();
      client.clear();
    },
  };
}

test.each(["direct", "federated"])(
  "a %s missing-message error opens the latest pages and follows new messages",
  async (kind) => {
    const view = await openAtAnchor();
    expect(view.result.current.anchor).toBe(MISSING);
    expect(view.result.current.pages[0]?.data).toBeUndefined();

    const error = new ConvexError({ code: "MESSAGE_NOT_FOUND" });
    await view.answer(kind === "direct" ? directFailure(error) : failed(error));
    await waitFor(() => expect(view.result.current.anchor).toBeUndefined());
    expect(view.result.current.live).toBe(true);
    const latest = latestPageQueries(
      SESSION,
      view.source.conversationId,
      NOW + 1,
    );
    await act(() => {
      for (const query of latest) {
        view.client.setQueryData(query.queryKey, success(PAGE), {
          updatedAt: NOW + 2,
        });
      }
    });
    await waitFor(() =>
      expect(
        view.result.current.pages.every((page) => page.data !== undefined),
      ).toBe(true),
    );

    const message = {
      messageId: "new-message",
      conversationId: view.source.conversationId,
      authorId: SESSION,
      sentAt: NOW + 3,
      body: "The chat still works",
      attachments: [],
      authorName: "Me",
      linkPreview: null,
    };
    const livePage = latest[1];
    expect(livePage).toBeDefined();
    await act(() => {
      if (livePage !== undefined)
        view.client.setQueryData(
          livePage.queryKey,
          success({ ...PAGE, messages: [message] }),
          { updatedAt: NOW + 4 },
        );
    });
    await waitFor(() =>
      expect(view.result.current.messages).toEqual([message]),
    );
    await view.close();
  },
);

test.each([
  ["timeout", new PdsInitialResponseTimeoutError("https://pds.test")],
  ["network failure", new Error("offline")],
  ["permission failure", new ConvexError({ code: "CONVERSATION_NOT_FOUND" })],
])("a %s keeps the requested anchor", async (_name, error) => {
  const view = await openAtAnchor();
  await view.answer(directFailure(error));
  expect(view.result.current.anchor).toBe(MISSING);
  await view.answer(failed(error));
  expect(view.result.current.anchor).toBe(MISSING);
  expect(view.result.current.pages[0]?.data).toBeUndefined();
  await view.close();
});

test("reopening a cached missing target also opens the latest messages", async () => {
  const view = await openAtAnchor(
    directFailure(new ConvexError({ code: "MESSAGE_NOT_FOUND" })),
  );
  expect(view.result.current.anchor).toBeUndefined();
  expect(view.result.current.live).toBe(true);
  await view.close();
});

test("a missing target on one PDS does not discard another PDS's pending answer", async () => {
  const view = await openAtAnchor();
  const missing = failed(new ConvexError({ code: "MESSAGE_NOT_FOUND" }));
  await view.answer({
    status: "loading",
    federation: {
      status: "pending",
      sources: [
        ...missing.federation.sources,
        {
          status: "pending",
          target: { ids: ["remote"], url: "https://remote.test" },
        },
      ],
    },
  });
  expect(view.result.current.anchor).toBe(MISSING);
  await view.close();
});

test("mixed missing-message and connection errors retain the anchor", async () => {
  const view = await openAtAnchor();
  await view.answer(
    failed(
      new ConvexError({ code: "MESSAGE_NOT_FOUND" }),
      new Error("offline"),
    ),
  );
  expect(view.result.current.anchor).toBe(MISSING);
  await view.close();
});

test("an existing target keeps its anchored window", async () => {
  const view = await openAtAnchor();
  await view.answer(success({ ...PAGE, hasNewer: true }));
  await waitFor(() => expect(view.result.current.pages[0]?.data).toBeDefined());
  expect(view.result.current.anchor).toBe(MISSING);
  await view.close();
});
