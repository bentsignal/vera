import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

import type { DecentralizedConvexClient } from "./client.ts";
import type { PdsClient, PdsRequestResult } from "./pds.ts";
import type { FederatedQuerySnapshot } from "./types.ts";
import { definePdsApi } from "./pds.ts";

const messaging = definePluginProtocol({
  name: "messaging",
  mutations: {
    sendMessage: defineOperation({
      args: v.object({ body: v.string() }),
      returns: v.object({ messageId: v.string() }),
    }),
  },
  queries: {
    listMessages: defineOperation({
      args: v.object({ conversationId: v.string() }),
      returns: v.array(v.object({ body: v.string() })),
    }),
  },
  requires: {},
  version: "1",
});

const api = definePdsApi(messaging);
declare const client: PdsClient;
const bound = client.bind(api);
const send = api.messaging.mutations.sendMessage({ body: "hello" });
const list = api.messaging.queries.listMessages({ conversationId: "general" });
const conciseSend = api.messaging.sendMessage({ body: "hello" });
const conciseList = api.messaging.listMessages({ conversationId: "general" });
void send;
void list;
void conciseSend;
void conciseList;

const boundSendResult: Promise<{ messageId: string }> =
  bound.messaging.mutation.sendMessage({ body: "hello" });
const boundListResult: Promise<{ body: string }[]> =
  bound.messaging.query.listMessages({ conversationId: "general" });
void boundSendResult;
void boundListResult;

declare const federationClient: DecentralizedConvexClient;
const federatedListResult: Promise<
  FederatedQuerySnapshot<{ body: string }[], { body: string }[]>
> = federationClient.federatedPdsQuery({
  request: list,
  targets: [{ id: "shawn@example.com", url: "https://pds.example.com" }],
});
void federatedListResult;

const sendResult: PdsRequestResult<typeof send> = { messageId: "message-1" };
const listResult: PdsRequestResult<typeof list> = [{ body: "hello" }];
void sendResult;
void listResult;

// @ts-expect-error -- the operation requires a string body.
api.messaging.mutations.sendMessage({ body: 42 });

type MessagingQueryName = keyof typeof api.messaging.queries;
// @ts-expect-error -- this operation is not part of the messaging contract.
const missingOperation: MessagingQueryName = "getProfile";
void missingOperation;

// @ts-expect-error -- sendMessage returns a message ID, not a message list.
const incorrectResult: PdsRequestResult<typeof send> = [{ body: "hello" }];
void incorrectResult;
