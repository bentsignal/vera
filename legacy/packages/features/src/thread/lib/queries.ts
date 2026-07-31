import { queryOptions } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";

import { api } from "@acme/db/api";

import { INITIAL_PAGE_SIZE as MESSAGE_PAGE_SIZE } from "../../messages/config/message-config";
import { INITIAL_PAGE_SIZE as THREAD_LIST_PAGE_SIZE } from "../config/thread-config";

export const threadQueries = {
  listFirstPage: (search = "") =>
    queryOptions({
      ...convexQuery(api.ai.thread.list.get, {
        search,
        paginationOpts: {
          numItems: THREAD_LIST_PAGE_SIZE,
          cursor: null,
        },
      }),
    }),
  messagesFirstPage: (threadId: string) =>
    queryOptions({
      ...convexQuery(api.ai.thread.messages.list, {
        threadId,
        paginationOpts: {
          numItems: MESSAGE_PAGE_SIZE,
          cursor: null,
        },
        streamArgs: { kind: "list" },
      }),
    }),
  state: (threadId: string) =>
    queryOptions({
      ...convexQuery(api.ai.thread.state.get, { threadId }),
    }),
  title: (threadId: string) =>
    queryOptions({
      ...convexQuery(api.ai.thread.title.get, { threadId }),
    }),
  followUps: (threadId: string) =>
    queryOptions({
      ...convexQuery(api.ai.thread.followUps.get, { threadId }),
    }),
};
