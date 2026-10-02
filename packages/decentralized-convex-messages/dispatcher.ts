import {
  defineComponentDispatchers,
  routedQueryResult,
} from "@decentralized-convex/server";

import { mutation, query } from "./_generated/server.js";
import * as conversations from "./conversations.ts";
import { requireAccountId } from "./model.ts";
import { messagesProtocol } from "./protocol.ts";
import * as push from "./pushTokens.ts";
import * as spaces from "./spaces.ts";

export const { dispatchMutation, dispatchQuery } = defineComponentDispatchers({
  handlers: {
    mutations: {
      addGroupMembers: (ctx, { args, identity }) =>
        conversations.addGroupMembers(ctx, requireAccountId(identity), args),
      addSpaceMembers: (ctx, { args, identity }) =>
        spaces.addSpaceMembers(ctx, requireAccountId(identity), args),
      createChannel: (ctx, { args, identity }) =>
        spaces.createChannel(ctx, requireAccountId(identity), args),
      createGroup: (ctx, { args, identity }) =>
        conversations.createGroup(ctx, requireAccountId(identity), args),
      createSpace: (ctx, { args, identity }) =>
        spaces.createSpace(ctx, requireAccountId(identity), args),
      deleteChannel: (ctx, { args, identity }) =>
        spaces.deleteChannel(ctx, requireAccountId(identity), args),
      leaveConversation: (ctx, { args, identity }) =>
        conversations.leaveConversation(ctx, requireAccountId(identity), args),
      markRead: (ctx, { args, identity }) =>
        conversations.markRead(ctx, requireAccountId(identity), args),
      openDirect: (ctx, { args, identity }) =>
        conversations.openDirect(ctx, requireAccountId(identity), args),
      registerPushToken: (ctx, { args, identity }) =>
        push.registerPushToken(ctx, requireAccountId(identity), args.token),
      removeSpaceMember: (ctx, { args, identity }) =>
        spaces.removeSpaceMember(ctx, requireAccountId(identity), args),
      renameChannel: (ctx, { args, identity }) =>
        spaces.renameChannel(ctx, requireAccountId(identity), args),
      renameGroup: (ctx, { args, identity }) =>
        conversations.renameGroup(ctx, requireAccountId(identity), args),
      renameSpace: (ctx, { args, identity }) =>
        spaces.renameSpace(ctx, requireAccountId(identity), args),
      send: (ctx, { args, identity }) => {
        const self = requireAccountId(identity);
        const authorName = identity?.name?.trim() ?? self.split("@")[0] ?? self;
        return conversations.send(ctx, self, authorName, args);
      },
      setMuted: (ctx, { args, identity }) =>
        conversations.setMuted(ctx, requireAccountId(identity), args),
      unregisterPushToken: (ctx, { args, identity }) =>
        push.unregisterPushToken(ctx, requireAccountId(identity), args.token),
    },
    queries: {
      conversation: (ctx, { args, identity }) =>
        conversations.conversation(ctx, requireAccountId(identity), args),
      inbox: (ctx, { identity }) =>
        conversations.inbox(ctx, requireAccountId(identity)),
      list: async (ctx, { args, identity }) => {
        const { page, routes } = await conversations.list(
          ctx,
          requireAccountId(identity),
          args,
        );
        return routedQueryResult(page, routes);
      },
      space: (ctx, { args, identity }) =>
        spaces.space(ctx, requireAccountId(identity), args.spaceId),
      spaces: (ctx, { identity }) =>
        spaces.spaces(ctx, requireAccountId(identity)),
    },
  },
  mutation,
  protocol: messagesProtocol,
  query,
});
