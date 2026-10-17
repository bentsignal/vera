import {
  defineComponentDispatchers,
  routedQueryResult,
} from "@decentralized-convex/server";

import { mutation, query } from "./_generated/server.js";
import * as activity from "./activity.ts";
import * as alerts from "./alerts.ts";
import * as conversations from "./conversations.ts";
import * as editing from "./editing.ts";
import * as inbox from "./inbox.ts";
import * as invites from "./invites.ts";
import { cachedCards } from "./linkCache.ts";
import { requireAccountId } from "./model.ts";
import { prefetch } from "./previews.ts";
import { messagesProtocol } from "./protocol.ts";
import * as push from "./pushTokens.ts";
import * as reactions from "./reactions.ts";
import * as sending from "./sending.ts";
import * as settings from "./settings.ts";
import * as sightings from "./sightings.ts";
import * as spaces from "./spaces.ts";
import * as threadLists from "./threadLists.ts";
import * as threads from "./threads.ts";

export const { dispatchMutation, dispatchQuery } = defineComponentDispatchers({
  handlers: {
    mutations: {
      acceptSpaceInvite: (ctx, { args, identity }) =>
        invites.acceptSpaceInvite(ctx, requireAccountId(identity), args),
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
      createSpaceInviteLink: (ctx, { args, identity }) =>
        invites.createSpaceInviteLink(ctx, requireAccountId(identity), args),
      declineSpaceInvite: (ctx, { args, identity }) =>
        invites.declineSpaceInvite(ctx, requireAccountId(identity), args),
      deleteMessage: (ctx, { args, identity }) =>
        editing.deleteMessage(ctx, requireAccountId(identity), args),
      editMessage: (ctx, { args, identity }) =>
        editing.editMessage(
          ctx,
          requireAccountId(identity),
          args,
          sending.startLinkCards,
        ),
      deleteChannel: (ctx, { args, identity }) =>
        spaces.deleteChannel(ctx, requireAccountId(identity), args),
      inviteToSpace: (ctx, { args, identity }) =>
        invites.inviteToSpace(ctx, requireAccountId(identity), args),
      joinSpaceWithLink: (ctx, { args, identity }) =>
        invites.joinSpaceWithLink(ctx, requireAccountId(identity), args),
      leaveConversation: (ctx, { args, identity }) =>
        conversations.leaveConversation(ctx, requireAccountId(identity), args),
      markActivitySeen: (ctx, { args, identity }) =>
        sightings.markActivitySeen(ctx, requireAccountId(identity), args),
      markRead: (ctx, { args, identity }) =>
        conversations.markRead(ctx, requireAccountId(identity), args),
      markThreadRead: (ctx, { args, identity }) =>
        threads.markThreadRead(ctx, requireAccountId(identity), args),
      openDirect: (ctx, { args, identity }) =>
        conversations.openDirect(ctx, requireAccountId(identity), args),
      prefetchLinkPreviews: async (ctx, { args, identity }) => {
        requireAccountId(identity);
        await prefetch(ctx, args.urls);
        return null;
      },
      react: (ctx, { args, identity }) => {
        const self = requireAccountId(identity);
        const name = identity?.name?.trim() ?? self.split("@")[0] ?? self;
        return reactions.react(ctx, self, name, args);
      },
      registerPushToken: (ctx, { args, identity }) =>
        push.registerPushToken(ctx, requireAccountId(identity), args),
      removeSpaceMember: (ctx, { args, identity }) =>
        spaces.removeSpaceMember(ctx, requireAccountId(identity), args),
      renameChannel: (ctx, { args, identity }) =>
        spaces.renameChannel(ctx, requireAccountId(identity), args),
      renameGroup: (ctx, { args, identity }) =>
        conversations.renameGroup(ctx, requireAccountId(identity), args),
      renameSpace: (ctx, { args, identity }) =>
        spaces.renameSpace(ctx, requireAccountId(identity), args),
      setSpaceInviteLinkExpiry: (ctx, { args, identity }) =>
        invites.setSpaceInviteLinkExpiry(ctx, requireAccountId(identity), args),
      revokeSpaceInviteLink: (ctx, { args, identity }) =>
        invites.revokeSpaceInviteLink(ctx, requireAccountId(identity), args),
      send: (ctx, { args, identity }) => {
        const self = requireAccountId(identity);
        const authorName = identity?.name?.trim() ?? self.split("@")[0] ?? self;
        return sending.send(ctx, self, authorName, args);
      },
      setAlerts: (ctx, { args, identity }) =>
        alerts.setAlerts(ctx, requireAccountId(identity), args),
      setMuted: (ctx, { args, identity }) =>
        alerts.setMuted(ctx, requireAccountId(identity), args),
      setNotificationSettings: (ctx, { args, identity }) =>
        settings.setNotificationSettings(ctx, requireAccountId(identity), args),
      setSpaceAlerts: (ctx, { args, identity }) =>
        alerts.setSpaceAlerts(ctx, requireAccountId(identity), args),
      setSpaceMuted: (ctx, { args, identity }) =>
        alerts.setSpaceMuted(ctx, requireAccountId(identity), args),
      setThreadFollowed: (ctx, { args, identity }) =>
        threads.setThreadFollowed(ctx, requireAccountId(identity), args),
      setPinned: (ctx, { args, identity }) =>
        inbox.setPinned(ctx, requireAccountId(identity), args),
      setShowInInbox: (ctx, { args, identity }) =>
        inbox.setShowInInbox(ctx, requireAccountId(identity), args),
      unregisterPushToken: (ctx, { args, identity }) =>
        push.unregisterPushToken(ctx, requireAccountId(identity), args.token),
    },
    queries: {
      activity: (ctx, { args, identity }) =>
        activity.activity(ctx, requireAccountId(identity), args),
      conversation: (ctx, { args, identity }) =>
        conversations.conversation(ctx, requireAccountId(identity), args),
      inbox: (ctx, { args, identity }) =>
        inbox.inbox(ctx, requireAccountId(identity), args),
      inboxThreads: (ctx, { identity }) =>
        threadLists.inboxThreads(ctx, requireAccountId(identity)),
      list: async (ctx, { args, identity }) => {
        const { page, routes } = await conversations.list(
          ctx,
          requireAccountId(identity),
          args,
        );
        return routedQueryResult(page, routes);
      },
      memberEvents: (ctx, { args, identity }) =>
        conversations.memberEvents(ctx, requireAccountId(identity), args),
      notificationSettings: (ctx, { identity }) =>
        settings.notificationSettings(ctx, requireAccountId(identity)),
      linkPreviews: (ctx, { args, identity }) => {
        requireAccountId(identity);
        return cachedCards(ctx, args.urls, Date.now());
      },
      reactions: async (ctx, { args, identity }) => {
        const found = await reactions.reactions(
          ctx,
          requireAccountId(identity),
          args,
        );
        return routedQueryResult(found.reactions, found.routes);
      },
      space: (ctx, { args, identity }) =>
        spaces.space(ctx, requireAccountId(identity), args.spaceId),
      thread: async (ctx, { args, identity }) => {
        const found = await threads.thread(
          ctx,
          requireAccountId(identity),
          args,
        );
        return routedQueryResult(found.page, found.routes);
      },
      threads: async (ctx, { args, identity }) => {
        const found = await threadLists.threads(
          ctx,
          requireAccountId(identity),
          args,
        );
        return routedQueryResult(found.page, found.routes);
      },
      threadState: (ctx, { args, identity }) =>
        threads.threadState(ctx, requireAccountId(identity), args),
      threadSummaries: async (ctx, { args, identity }) => {
        const found = await threads.threadSummaries(
          ctx,
          requireAccountId(identity),
          args,
        );
        return routedQueryResult(found.summaries, found.routes);
      },
      spaceInviteLinkPreview: (ctx, { args, identity }) =>
        invites.spaceInviteLinkPreview(
          ctx,
          requireAccountId(identity),
          args.code,
        ),
      spaceInviteLinks: (ctx, { args, identity }) =>
        invites.spaceInviteLinks(ctx, requireAccountId(identity), args.spaceId),
      spaceInvites: (ctx, { identity }) =>
        invites.spaceInvites(ctx, requireAccountId(identity)),
      spaces: (ctx, { identity }) =>
        spaces.spaces(ctx, requireAccountId(identity)),
    },
  },
  mutation,
  protocol: messagesProtocol,
  query,
});
