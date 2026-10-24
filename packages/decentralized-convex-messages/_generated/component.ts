/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    dispatcher: {
      dispatchMutation: FunctionReference<
        "mutation",
        "internal",
        {
          identity: null | {
            accountId?: string;
            email?: string;
            issuer: string;
            name?: string;
            subject: string;
            tokenIdentifier: string;
          };
          lastChanged: "0.1.0";
          operation:
            | { args: { accountId: string }; type: "openDirect" }
            | {
                args: {
                  conversationId?: string;
                  members: Array<string>;
                  name?: string;
                };
                type: "createGroup";
              }
            | {
                args: { conversationId: string; name: string };
                type: "renameGroup";
              }
            | {
                args: { conversationId: string; members: Array<string> };
                type: "addGroupMembers";
              }
            | { args: { conversationId: string }; type: "leaveConversation" }
            | {
                args: {
                  attachments: Array<{
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  }>;
                  body: string;
                  conversationId: string;
                  mentions?: Array<{ accountId: string; name: string }>;
                  messageId: string;
                  threadId?: string;
                  threadOnly?: boolean;
                };
                type: "send";
              }
            | {
                args: {
                  body: string;
                  conversationId: string;
                  mentions?: Array<{ accountId: string; name: string }>;
                  messageId: string;
                };
                type: "editMessage";
              }
            | {
                args: { conversationId: string; messageId: string };
                type: "deleteMessage";
              }
            | {
                args: {
                  conversationId: string;
                  readAt: number;
                  threadId: string;
                };
                type: "markThreadRead";
              }
            | {
                args: {
                  conversationId: string;
                  followed: boolean;
                  threadId: string;
                };
                type: "setThreadFollowed";
              }
            | { args: { urls: Array<string> }; type: "prefetchLinkPreviews" }
            | {
                args: {
                  attachment?: number;
                  conversationId: string;
                  emoji: string;
                  link?: number;
                  messageId: string;
                  on: boolean;
                };
                type: "react";
              }
            | {
                args: {
                  conversationId: string;
                  threadId?: string;
                  typing: boolean;
                };
                type: "setTyping";
              }
            | {
                args: { items: Array<{ key: string; through: number }> };
                type: "markActivitySeen";
              }
            | {
                args: { conversationId: string; readAt: number };
                type: "markRead";
              }
            | {
                args: { conversationId: string; muted: boolean };
                type: "setMuted";
              }
            | {
                args: {
                  alerts: "all" | "mentions" | "none";
                  conversationId: string;
                };
                type: "setAlerts";
              }
            | {
                args: { muted: boolean; spaceId: string };
                type: "setSpaceMuted";
              }
            | {
                args: { alerts: "all" | "mentions" | "none"; spaceId: string };
                type: "setSpaceAlerts";
              }
            | {
                args: {
                  channelAlerts?: "all" | "mentions" | "none";
                  channels?: boolean;
                  directMessages?: boolean;
                  enabled?: boolean;
                  groupAlerts?: "all" | "mentions" | "none";
                  groups?: boolean;
                  invites?: boolean;
                  reactions?: boolean;
                  replies?: boolean;
                  threadReplies?: boolean;
                  yourName?: boolean;
                };
                type: "setNotificationSettings";
              }
            | {
                args: { conversationId: string; pinned: boolean };
                type: "setPinned";
              }
            | {
                args: { conversationId: string; show: boolean };
                type: "setShowInInbox";
              }
            | {
                args: {
                  generalChannelId?: string;
                  name: string;
                  spaceId?: string;
                };
                type: "createSpace";
              }
            | { args: { name: string; spaceId: string }; type: "renameSpace" }
            | {
                args: { members: Array<string>; spaceId: string };
                type: "addSpaceMembers";
              }
            | {
                args: { members: Array<string>; spaceId: string };
                type: "inviteToSpace";
              }
            | { args: { spaceId: string }; type: "acceptSpaceInvite" }
            | { args: { spaceId: string }; type: "declineSpaceInvite" }
            | {
                args: { expiresIn?: number; spaceId: string };
                type: "createSpaceInviteLink";
              }
            | {
                args: { code: string; expiresIn?: number };
                type: "setSpaceInviteLinkExpiry";
              }
            | { args: { code: string }; type: "revokeSpaceInviteLink" }
            | { args: { code: string }; type: "joinSpaceWithLink" }
            | {
                args: { accountId: string; spaceId: string };
                type: "removeSpaceMember";
              }
            | {
                args: {
                  conversationId?: string;
                  name: string;
                  spaceId: string;
                };
                type: "createChannel";
              }
            | {
                args: { conversationId: string; name: string };
                type: "renameChannel";
              }
            | { args: { conversationId: string }; type: "deleteChannel" }
            | {
                args: {
                  inbox?: Array<"chats" | "channels" | "threads">;
                  threads?: boolean;
                  token: string;
                };
                type: "registerPushToken";
              }
            | { args: { token: string }; type: "unregisterPushToken" };
          version: string;
        },
        | {
            routes?: Array<string>;
            type: "openDirect";
            value: { conversationId: string };
          }
        | {
            routes?: Array<string>;
            type: "createGroup";
            value: { conversationId: string };
          }
        | { routes?: Array<string>; type: "renameGroup"; value: null }
        | { routes?: Array<string>; type: "addGroupMembers"; value: null }
        | { routes?: Array<string>; type: "leaveConversation"; value: null }
        | {
            routes?: Array<string>;
            type: "send";
            value: {
              attachments: Array<{
                durationMs?: number;
                height?: number;
                kind: "image" | "video" | "file";
                mimeType: string;
                name: string;
                size: number;
                thumbnailUrl?: string;
                url: string;
                width?: number;
              }>;
              authorId: string;
              authorName: string;
              body: string;
              conversationId: string;
              deletedAt?: number;
              editedAt?: number;
              linkPreview: null | {
                description?: string;
                imageUrl?: string;
                siteName?: string;
                title?: string;
                url: string;
                video?: {
                  durationMs?: number;
                  height?: number;
                  url: string;
                  width?: number;
                };
              };
              linkPreviews?: Array<{
                link: string;
                preview?: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                  video?: {
                    durationMs?: number;
                    height?: number;
                    url: string;
                    width?: number;
                  };
                };
              }>;
              mentions?: Array<{ accountId: string; name: string }>;
              messageId: string;
              quote?: {
                attachment?: {
                  durationMs?: number;
                  height?: number;
                  kind: "image" | "video" | "file";
                  mimeType: string;
                  name: string;
                  size: number;
                  thumbnailUrl?: string;
                  url: string;
                  width?: number;
                };
                authorId: string;
                body: string;
                deleted?: boolean;
                messageId?: string;
              };
              sentAt: number;
              threadId?: string;
              threadOnly?: boolean;
            };
          }
        | {
            routes?: Array<string>;
            type: "editMessage";
            value: {
              attachments: Array<{
                durationMs?: number;
                height?: number;
                kind: "image" | "video" | "file";
                mimeType: string;
                name: string;
                size: number;
                thumbnailUrl?: string;
                url: string;
                width?: number;
              }>;
              authorId: string;
              authorName: string;
              body: string;
              conversationId: string;
              deletedAt?: number;
              editedAt?: number;
              linkPreview: null | {
                description?: string;
                imageUrl?: string;
                siteName?: string;
                title?: string;
                url: string;
                video?: {
                  durationMs?: number;
                  height?: number;
                  url: string;
                  width?: number;
                };
              };
              linkPreviews?: Array<{
                link: string;
                preview?: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                  video?: {
                    durationMs?: number;
                    height?: number;
                    url: string;
                    width?: number;
                  };
                };
              }>;
              mentions?: Array<{ accountId: string; name: string }>;
              messageId: string;
              quote?: {
                attachment?: {
                  durationMs?: number;
                  height?: number;
                  kind: "image" | "video" | "file";
                  mimeType: string;
                  name: string;
                  size: number;
                  thumbnailUrl?: string;
                  url: string;
                  width?: number;
                };
                authorId: string;
                body: string;
                deleted?: boolean;
                messageId?: string;
              };
              sentAt: number;
              threadId?: string;
              threadOnly?: boolean;
            };
          }
        | { routes?: Array<string>; type: "deleteMessage"; value: null }
        | { routes?: Array<string>; type: "markThreadRead"; value: null }
        | { routes?: Array<string>; type: "setThreadFollowed"; value: null }
        | { routes?: Array<string>; type: "prefetchLinkPreviews"; value: null }
        | { routes?: Array<string>; type: "react"; value: null }
        | { routes?: Array<string>; type: "setTyping"; value: null }
        | { routes?: Array<string>; type: "markActivitySeen"; value: null }
        | { routes?: Array<string>; type: "markRead"; value: null }
        | { routes?: Array<string>; type: "setMuted"; value: null }
        | { routes?: Array<string>; type: "setAlerts"; value: null }
        | { routes?: Array<string>; type: "setSpaceMuted"; value: null }
        | { routes?: Array<string>; type: "setSpaceAlerts"; value: null }
        | {
            routes?: Array<string>;
            type: "setNotificationSettings";
            value: null;
          }
        | { routes?: Array<string>; type: "setPinned"; value: null }
        | { routes?: Array<string>; type: "setShowInInbox"; value: null }
        | {
            routes?: Array<string>;
            type: "createSpace";
            value: { spaceId: string };
          }
        | { routes?: Array<string>; type: "renameSpace"; value: null }
        | { routes?: Array<string>; type: "addSpaceMembers"; value: null }
        | { routes?: Array<string>; type: "inviteToSpace"; value: null }
        | { routes?: Array<string>; type: "acceptSpaceInvite"; value: null }
        | { routes?: Array<string>; type: "declineSpaceInvite"; value: null }
        | {
            routes?: Array<string>;
            type: "createSpaceInviteLink";
            value: {
              code: string;
              createdAt: number;
              createdBy: string;
              expiresAt: null | number;
            };
          }
        | {
            routes?: Array<string>;
            type: "setSpaceInviteLinkExpiry";
            value: {
              code: string;
              createdAt: number;
              createdBy: string;
              expiresAt: null | number;
            };
          }
        | { routes?: Array<string>; type: "revokeSpaceInviteLink"; value: null }
        | {
            routes?: Array<string>;
            type: "joinSpaceWithLink";
            value: { spaceId: string };
          }
        | { routes?: Array<string>; type: "removeSpaceMember"; value: null }
        | {
            routes?: Array<string>;
            type: "createChannel";
            value: { conversationId: string };
          }
        | { routes?: Array<string>; type: "renameChannel"; value: null }
        | { routes?: Array<string>; type: "deleteChannel"; value: null }
        | { routes?: Array<string>; type: "registerPushToken"; value: null }
        | { routes?: Array<string>; type: "unregisterPushToken"; value: null },
        Name
      >;
      dispatchQueries: FunctionReference<
        "query",
        "internal",
        {
          identity: null | {
            accountId?: string;
            email?: string;
            issuer: string;
            name?: string;
            subject: string;
            tokenIdentifier: string;
          };
          requests: Array<{
            lastChanged: string;
            operation: { args: any; type: string };
            plugin: string;
            version: string;
          }>;
        },
        Array<
          | null
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "inbox";
              value: Array<{
                alerts?: "all" | "mentions" | "none";
                changedAt?: number;
                conversationId: string;
                kind: "direct" | "group" | "channel";
                lastMessage: null | {
                  attachments: Array<{
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  }>;
                  authorId: string;
                  authorName: string;
                  body: string;
                  conversationId: string;
                  deletedAt?: number;
                  editedAt?: number;
                  linkPreview: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                  linkPreviews?: Array<{
                    link: string;
                    preview?: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                  }>;
                  mentions?: Array<{ accountId: string; name: string }>;
                  messageId: string;
                  quote?: {
                    attachment?: {
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    };
                    authorId: string;
                    body: string;
                    deleted?: boolean;
                    messageId?: string;
                  };
                  sentAt: number;
                  threadId?: string;
                  threadOnly?: boolean;
                };
                members: Array<string>;
                muted: boolean;
                name: null | string;
                pinnedAt?: number;
                showInInbox?: boolean;
                spaceId: null | string;
                spaceName?: string;
                unreadCount: number;
                updatedAt: number;
              }>;
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "activity";
              value: Array<
                | {
                    at: number;
                    authors: Array<string>;
                    conversation: {
                      conversationId: string;
                      kind: "direct" | "group" | "channel";
                      members: Array<string>;
                      name: null | string;
                      spaceId: null | string;
                      spaceName?: string;
                    };
                    count: number;
                    key: string;
                    kind: "messages";
                    latest: {
                      attachments: Array<{
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      }>;
                      authorId: string;
                      authorName: string;
                      body: string;
                      conversationId: string;
                      deletedAt?: number;
                      editedAt?: number;
                      linkPreview: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                      linkPreviews?: Array<{
                        link: string;
                        preview?: null | {
                          description?: string;
                          imageUrl?: string;
                          siteName?: string;
                          title?: string;
                          url: string;
                          video?: {
                            durationMs?: number;
                            height?: number;
                            url: string;
                            width?: number;
                          };
                        };
                      }>;
                      mentions?: Array<{ accountId: string; name: string }>;
                      messageId: string;
                      quote?: {
                        attachment?: {
                          durationMs?: number;
                          height?: number;
                          kind: "image" | "video" | "file";
                          mimeType: string;
                          name: string;
                          size: number;
                          thumbnailUrl?: string;
                          url: string;
                          width?: number;
                        };
                        authorId: string;
                        body: string;
                        deleted?: boolean;
                        messageId?: string;
                      };
                      sentAt: number;
                      threadId?: string;
                      threadOnly?: boolean;
                    };
                    seenAt?: number;
                    seenThrough?: number;
                  }
                | {
                    at: number;
                    conversation: {
                      conversationId: string;
                      kind: "direct" | "group" | "channel";
                      members: Array<string>;
                      name: null | string;
                      spaceId: null | string;
                      spaceName?: string;
                    };
                    key: string;
                    kind: "reactions";
                    message: {
                      attachments: Array<{
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      }>;
                      authorId: string;
                      authorName: string;
                      body: string;
                      conversationId: string;
                      deletedAt?: number;
                      editedAt?: number;
                      linkPreview: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                      linkPreviews?: Array<{
                        link: string;
                        preview?: null | {
                          description?: string;
                          imageUrl?: string;
                          siteName?: string;
                          title?: string;
                          url: string;
                          video?: {
                            durationMs?: number;
                            height?: number;
                            url: string;
                            width?: number;
                          };
                        };
                      }>;
                      mentions?: Array<{ accountId: string; name: string }>;
                      messageId: string;
                      quote?: {
                        attachment?: {
                          durationMs?: number;
                          height?: number;
                          kind: "image" | "video" | "file";
                          mimeType: string;
                          name: string;
                          size: number;
                          thumbnailUrl?: string;
                          url: string;
                          width?: number;
                        };
                        authorId: string;
                        body: string;
                        deleted?: boolean;
                        messageId?: string;
                      };
                      sentAt: number;
                      threadId?: string;
                      threadOnly?: boolean;
                    };
                    reactions: Array<{
                      accountId: string;
                      attachment?: number;
                      emoji: string;
                      link?: number;
                      messageId: string;
                      reactedAt: number;
                    }>;
                    seenAt?: number;
                    seenThrough?: number;
                  }
                | {
                    at: number;
                    conversation: {
                      conversationId: string;
                      kind: "direct" | "group" | "channel";
                      members: Array<string>;
                      name: null | string;
                      spaceId: null | string;
                      spaceName?: string;
                    };
                    key: string;
                    kind: "mention";
                    message: {
                      attachments: Array<{
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      }>;
                      authorId: string;
                      authorName: string;
                      body: string;
                      conversationId: string;
                      deletedAt?: number;
                      editedAt?: number;
                      linkPreview: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                      linkPreviews?: Array<{
                        link: string;
                        preview?: null | {
                          description?: string;
                          imageUrl?: string;
                          siteName?: string;
                          title?: string;
                          url: string;
                          video?: {
                            durationMs?: number;
                            height?: number;
                            url: string;
                            width?: number;
                          };
                        };
                      }>;
                      mentions?: Array<{ accountId: string; name: string }>;
                      messageId: string;
                      quote?: {
                        attachment?: {
                          durationMs?: number;
                          height?: number;
                          kind: "image" | "video" | "file";
                          mimeType: string;
                          name: string;
                          size: number;
                          thumbnailUrl?: string;
                          url: string;
                          width?: number;
                        };
                        authorId: string;
                        body: string;
                        deleted?: boolean;
                        messageId?: string;
                      };
                      sentAt: number;
                      threadId?: string;
                      threadOnly?: boolean;
                    };
                    seenAt?: number;
                    seenThrough?: number;
                  }
                | {
                    at: number;
                    conversation: {
                      conversationId: string;
                      kind: "direct" | "group" | "channel";
                      members: Array<string>;
                      name: null | string;
                      spaceId: null | string;
                      spaceName?: string;
                    };
                    key: string;
                    kind: "reply";
                    message: {
                      attachments: Array<{
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      }>;
                      authorId: string;
                      authorName: string;
                      body: string;
                      conversationId: string;
                      deletedAt?: number;
                      editedAt?: number;
                      linkPreview: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                      linkPreviews?: Array<{
                        link: string;
                        preview?: null | {
                          description?: string;
                          imageUrl?: string;
                          siteName?: string;
                          title?: string;
                          url: string;
                          video?: {
                            durationMs?: number;
                            height?: number;
                            url: string;
                            width?: number;
                          };
                        };
                      }>;
                      mentions?: Array<{ accountId: string; name: string }>;
                      messageId: string;
                      quote?: {
                        attachment?: {
                          durationMs?: number;
                          height?: number;
                          kind: "image" | "video" | "file";
                          mimeType: string;
                          name: string;
                          size: number;
                          thumbnailUrl?: string;
                          url: string;
                          width?: number;
                        };
                        authorId: string;
                        body: string;
                        deleted?: boolean;
                        messageId?: string;
                      };
                      sentAt: number;
                      threadId?: string;
                      threadOnly?: boolean;
                    };
                    seenAt?: number;
                    seenThrough?: number;
                  }
                | {
                    at: number;
                    authors: Array<string>;
                    conversation: {
                      conversationId: string;
                      kind: "direct" | "group" | "channel";
                      members: Array<string>;
                      name: null | string;
                      spaceId: null | string;
                      spaceName?: string;
                    };
                    count: number;
                    key: string;
                    kind: "thread";
                    latest: {
                      attachments: Array<{
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      }>;
                      authorId: string;
                      authorName: string;
                      body: string;
                      conversationId: string;
                      deletedAt?: number;
                      editedAt?: number;
                      linkPreview: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                      linkPreviews?: Array<{
                        link: string;
                        preview?: null | {
                          description?: string;
                          imageUrl?: string;
                          siteName?: string;
                          title?: string;
                          url: string;
                          video?: {
                            durationMs?: number;
                            height?: number;
                            url: string;
                            width?: number;
                          };
                        };
                      }>;
                      mentions?: Array<{ accountId: string; name: string }>;
                      messageId: string;
                      quote?: {
                        attachment?: {
                          durationMs?: number;
                          height?: number;
                          kind: "image" | "video" | "file";
                          mimeType: string;
                          name: string;
                          size: number;
                          thumbnailUrl?: string;
                          url: string;
                          width?: number;
                        };
                        authorId: string;
                        body: string;
                        deleted?: boolean;
                        messageId?: string;
                      };
                      sentAt: number;
                      threadId?: string;
                      threadOnly?: boolean;
                    };
                    root: null | {
                      attachments: Array<{
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      }>;
                      authorId: string;
                      authorName: string;
                      body: string;
                      conversationId: string;
                      deletedAt?: number;
                      editedAt?: number;
                      linkPreview: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                      linkPreviews?: Array<{
                        link: string;
                        preview?: null | {
                          description?: string;
                          imageUrl?: string;
                          siteName?: string;
                          title?: string;
                          url: string;
                          video?: {
                            durationMs?: number;
                            height?: number;
                            url: string;
                            width?: number;
                          };
                        };
                      }>;
                      mentions?: Array<{ accountId: string; name: string }>;
                      messageId: string;
                      quote?: {
                        attachment?: {
                          durationMs?: number;
                          height?: number;
                          kind: "image" | "video" | "file";
                          mimeType: string;
                          name: string;
                          size: number;
                          thumbnailUrl?: string;
                          url: string;
                          width?: number;
                        };
                        authorId: string;
                        body: string;
                        deleted?: boolean;
                        messageId?: string;
                      };
                      sentAt: number;
                      threadId?: string;
                      threadOnly?: boolean;
                    };
                    seenAt?: number;
                    seenThrough?: number;
                    threadId: string;
                  }
              >;
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "notificationSettings";
              value: {
                channelAlerts?: "all" | "mentions" | "none";
                channels: boolean;
                directMessages: boolean;
                enabled: boolean;
                groupAlerts?: "all" | "mentions" | "none";
                groups: boolean;
                invites: boolean;
                reactions: boolean;
                replies?: boolean;
                threadReplies?: boolean;
                yourName?: boolean;
              };
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "conversation";
              value: null | {
                alerts?: "all" | "mentions" | "none";
                changedAt?: number;
                conversationId: string;
                kind: "direct" | "group" | "channel";
                lastMessage: null | {
                  attachments: Array<{
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  }>;
                  authorId: string;
                  authorName: string;
                  body: string;
                  conversationId: string;
                  deletedAt?: number;
                  editedAt?: number;
                  linkPreview: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                  linkPreviews?: Array<{
                    link: string;
                    preview?: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                  }>;
                  mentions?: Array<{ accountId: string; name: string }>;
                  messageId: string;
                  quote?: {
                    attachment?: {
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    };
                    authorId: string;
                    body: string;
                    deleted?: boolean;
                    messageId?: string;
                  };
                  sentAt: number;
                  threadId?: string;
                  threadOnly?: boolean;
                };
                members: Array<string>;
                muted: boolean;
                name: null | string;
                pinnedAt?: number;
                showInInbox?: boolean;
                spaceId: null | string;
                spaceName?: string;
                unreadCount: number;
                updatedAt: number;
              };
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "list";
              value: {
                hasNewer: boolean;
                hasOlder: boolean;
                messages: Array<{
                  attachments: Array<{
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  }>;
                  authorId: string;
                  authorName: string;
                  body: string;
                  conversationId: string;
                  deletedAt?: number;
                  editedAt?: number;
                  linkPreview: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                  linkPreviews?: Array<{
                    link: string;
                    preview?: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                  }>;
                  mentions?: Array<{ accountId: string; name: string }>;
                  messageId: string;
                  quote?: {
                    attachment?: {
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    };
                    authorId: string;
                    body: string;
                    deleted?: boolean;
                    messageId?: string;
                  };
                  sentAt: number;
                  threadId?: string;
                  threadOnly?: boolean;
                }>;
              };
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "memberEvents";
              value: Array<{
                accountId: string;
                at: number;
                by?: string;
                eventId: string;
                kind: "joined" | "left";
              }>;
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "reactions";
              value: Array<{
                accountId: string;
                attachment?: number;
                emoji: string;
                link?: number;
                messageId: string;
                reactedAt: number;
              }>;
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "typing";
              value: Array<{
                accountId: string;
                expiresIn: number;
                startedAt: number;
                typedAt: number;
              }>;
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "thread";
              value: {
                hasNewer: boolean;
                hasOlder: boolean;
                messages: Array<{
                  attachments: Array<{
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  }>;
                  authorId: string;
                  authorName: string;
                  body: string;
                  conversationId: string;
                  deletedAt?: number;
                  editedAt?: number;
                  linkPreview: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                  linkPreviews?: Array<{
                    link: string;
                    preview?: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                  }>;
                  mentions?: Array<{ accountId: string; name: string }>;
                  messageId: string;
                  quote?: {
                    attachment?: {
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    };
                    authorId: string;
                    body: string;
                    deleted?: boolean;
                    messageId?: string;
                  };
                  sentAt: number;
                  threadId?: string;
                  threadOnly?: boolean;
                }>;
                root: null | {
                  attachments: Array<{
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  }>;
                  authorId: string;
                  authorName: string;
                  body: string;
                  conversationId: string;
                  deletedAt?: number;
                  editedAt?: number;
                  linkPreview: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                  linkPreviews?: Array<{
                    link: string;
                    preview?: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                  }>;
                  mentions?: Array<{ accountId: string; name: string }>;
                  messageId: string;
                  quote?: {
                    attachment?: {
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    };
                    authorId: string;
                    body: string;
                    deleted?: boolean;
                    messageId?: string;
                  };
                  sentAt: number;
                  threadId?: string;
                  threadOnly?: boolean;
                };
              };
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "threadSummaries";
              value: Array<{
                lastReplyAt: number;
                repliers: Array<string>;
                replyCount: number;
                threadId: string;
              }>;
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "threads";
              value: {
                hasMore: boolean;
                threads: Array<{
                  conversationId: string;
                  following: boolean;
                  lastReadAt: null | number;
                  lastReplyAt: number;
                  repliers: Array<string>;
                  replyCount: number;
                  root: null | {
                    attachments: Array<{
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    }>;
                    authorId: string;
                    authorName: string;
                    body: string;
                    conversationId: string;
                    deletedAt?: number;
                    editedAt?: number;
                    linkPreview: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                    linkPreviews?: Array<{
                      link: string;
                      preview?: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                    }>;
                    mentions?: Array<{ accountId: string; name: string }>;
                    messageId: string;
                    quote?: {
                      attachment?: {
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      };
                      authorId: string;
                      body: string;
                      deleted?: boolean;
                      messageId?: string;
                    };
                    sentAt: number;
                    threadId?: string;
                    threadOnly?: boolean;
                  };
                  threadId: string;
                  unreadCount: number;
                }>;
              };
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "inboxThreads";
              value: Array<{
                conversation: {
                  conversationId: string;
                  kind: "direct" | "group" | "channel";
                  members: Array<string>;
                  name: null | string;
                  spaceId: null | string;
                  spaceName?: string;
                };
                conversationId: string;
                following: boolean;
                lastReadAt: null | number;
                lastReplyAt: number;
                latest: null | {
                  attachments: Array<{
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  }>;
                  authorId: string;
                  authorName: string;
                  body: string;
                  conversationId: string;
                  deletedAt?: number;
                  editedAt?: number;
                  linkPreview: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                  linkPreviews?: Array<{
                    link: string;
                    preview?: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                  }>;
                  mentions?: Array<{ accountId: string; name: string }>;
                  messageId: string;
                  quote?: {
                    attachment?: {
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    };
                    authorId: string;
                    body: string;
                    deleted?: boolean;
                    messageId?: string;
                  };
                  sentAt: number;
                  threadId?: string;
                  threadOnly?: boolean;
                };
                repliers: Array<string>;
                replyCount: number;
                root: null | {
                  attachments: Array<{
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  }>;
                  authorId: string;
                  authorName: string;
                  body: string;
                  conversationId: string;
                  deletedAt?: number;
                  editedAt?: number;
                  linkPreview: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                  linkPreviews?: Array<{
                    link: string;
                    preview?: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                  }>;
                  mentions?: Array<{ accountId: string; name: string }>;
                  messageId: string;
                  quote?: {
                    attachment?: {
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    };
                    authorId: string;
                    body: string;
                    deleted?: boolean;
                    messageId?: string;
                  };
                  sentAt: number;
                  threadId?: string;
                  threadOnly?: boolean;
                };
                threadId: string;
                unreadCount: number;
              }>;
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "threadState";
              value: { following: boolean; lastReadAt: null | number };
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "linkPreviews";
              value: Array<{
                link: string;
                preview?: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                  video?: {
                    durationMs?: number;
                    height?: number;
                    url: string;
                    width?: number;
                  };
                };
              }>;
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "spaces";
              value: Array<{
                alerts?: "all" | "mentions" | "none";
                channels: Array<{
                  alerts?: "all" | "mentions" | "none";
                  conversationId: string;
                  muted?: boolean;
                  name: string;
                  position: number;
                  showInInbox?: boolean;
                  unreadCount: number;
                }>;
                invited?: Array<string>;
                joinedAt?: number;
                members: Array<{ accountId: string; role: "owner" | "member" }>;
                muted?: boolean;
                name: string;
                role: "owner" | "member";
                spaceId: string;
                unreadCount: number;
              }>;
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "space";
              value: null | {
                alerts?: "all" | "mentions" | "none";
                channels: Array<{
                  alerts?: "all" | "mentions" | "none";
                  conversationId: string;
                  muted?: boolean;
                  name: string;
                  position: number;
                  showInInbox?: boolean;
                  unreadCount: number;
                }>;
                invited?: Array<string>;
                joinedAt?: number;
                members: Array<{ accountId: string; role: "owner" | "member" }>;
                muted?: boolean;
                name: string;
                role: "owner" | "member";
                spaceId: string;
                unreadCount: number;
              };
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "spaceInvites";
              value: Array<{
                invitedAt: number;
                invitedBy: string;
                memberCount: number;
                name: string;
                spaceId: string;
              }>;
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "spaceInviteLinks";
              value: Array<{
                code: string;
                createdAt: number;
                createdBy: string;
                expiresAt: null | number;
              }>;
            }
          | {
              include?: Array<{
                lastChanged: string;
                operation: { args: any; type: string };
                plugin: string;
                version: string;
              }>;
              routes?: Array<string>;
              type: "spaceInviteLinkPreview";
              value: null | {
                expiresAt: null | number;
                isMember: boolean;
                memberCount: number;
                name: string;
                spaceId: string;
              };
            }
        >,
        Name
      >;
      dispatchQuery: FunctionReference<
        "query",
        "internal",
        {
          identity: null | {
            accountId?: string;
            email?: string;
            issuer: string;
            name?: string;
            subject: string;
            tokenIdentifier: string;
          };
          lastChanged: "0.1.0";
          operation:
            | { args: { channels?: boolean }; type: "inbox" }
            | {
                args: {
                  aboutYou?: boolean;
                  mentions?: boolean;
                  threads?: boolean;
                };
                type: "activity";
              }
            | { args: {}; type: "notificationSettings" }
            | { args: { conversationId: string }; type: "conversation" }
            | {
                args: {
                  after?: number;
                  around?: string;
                  before?: number;
                  conversationId: string;
                };
                type: "list";
              }
            | { args: { conversationId: string }; type: "memberEvents" }
            | {
                args: {
                  conversationId: string;
                  messageIds?: Array<string>;
                  since?: number;
                };
                type: "reactions";
              }
            | {
                args: { conversationId: string; threadId?: string };
                type: "typing";
              }
            | {
                args: {
                  after?: number;
                  before?: number;
                  conversationId: string;
                  threadId: string;
                };
                type: "thread";
              }
            | {
                args: {
                  conversationId: string;
                  messageIds?: Array<string>;
                  since?: number;
                };
                type: "threadSummaries";
              }
            | {
                args: {
                  before?: number;
                  conversationId: string;
                  limit?: number;
                  mine?: boolean;
                };
                type: "threads";
              }
            | { args: {}; type: "inboxThreads" }
            | {
                args: { conversationId: string; threadId: string };
                type: "threadState";
              }
            | { args: { urls: Array<string> }; type: "linkPreviews" }
            | { args: {}; type: "spaces" }
            | { args: { spaceId: string }; type: "space" }
            | { args: {}; type: "spaceInvites" }
            | { args: { spaceId: string }; type: "spaceInviteLinks" }
            | { args: { code: string }; type: "spaceInviteLinkPreview" };
          version: string;
        },
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "inbox";
            value: Array<{
              alerts?: "all" | "mentions" | "none";
              changedAt?: number;
              conversationId: string;
              kind: "direct" | "group" | "channel";
              lastMessage: null | {
                attachments: Array<{
                  durationMs?: number;
                  height?: number;
                  kind: "image" | "video" | "file";
                  mimeType: string;
                  name: string;
                  size: number;
                  thumbnailUrl?: string;
                  url: string;
                  width?: number;
                }>;
                authorId: string;
                authorName: string;
                body: string;
                conversationId: string;
                deletedAt?: number;
                editedAt?: number;
                linkPreview: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                  video?: {
                    durationMs?: number;
                    height?: number;
                    url: string;
                    width?: number;
                  };
                };
                linkPreviews?: Array<{
                  link: string;
                  preview?: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                }>;
                mentions?: Array<{ accountId: string; name: string }>;
                messageId: string;
                quote?: {
                  attachment?: {
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  };
                  authorId: string;
                  body: string;
                  deleted?: boolean;
                  messageId?: string;
                };
                sentAt: number;
                threadId?: string;
                threadOnly?: boolean;
              };
              members: Array<string>;
              muted: boolean;
              name: null | string;
              pinnedAt?: number;
              showInInbox?: boolean;
              spaceId: null | string;
              spaceName?: string;
              unreadCount: number;
              updatedAt: number;
            }>;
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "activity";
            value: Array<
              | {
                  at: number;
                  authors: Array<string>;
                  conversation: {
                    conversationId: string;
                    kind: "direct" | "group" | "channel";
                    members: Array<string>;
                    name: null | string;
                    spaceId: null | string;
                    spaceName?: string;
                  };
                  count: number;
                  key: string;
                  kind: "messages";
                  latest: {
                    attachments: Array<{
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    }>;
                    authorId: string;
                    authorName: string;
                    body: string;
                    conversationId: string;
                    deletedAt?: number;
                    editedAt?: number;
                    linkPreview: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                    linkPreviews?: Array<{
                      link: string;
                      preview?: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                    }>;
                    mentions?: Array<{ accountId: string; name: string }>;
                    messageId: string;
                    quote?: {
                      attachment?: {
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      };
                      authorId: string;
                      body: string;
                      deleted?: boolean;
                      messageId?: string;
                    };
                    sentAt: number;
                    threadId?: string;
                    threadOnly?: boolean;
                  };
                  seenAt?: number;
                  seenThrough?: number;
                }
              | {
                  at: number;
                  conversation: {
                    conversationId: string;
                    kind: "direct" | "group" | "channel";
                    members: Array<string>;
                    name: null | string;
                    spaceId: null | string;
                    spaceName?: string;
                  };
                  key: string;
                  kind: "reactions";
                  message: {
                    attachments: Array<{
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    }>;
                    authorId: string;
                    authorName: string;
                    body: string;
                    conversationId: string;
                    deletedAt?: number;
                    editedAt?: number;
                    linkPreview: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                    linkPreviews?: Array<{
                      link: string;
                      preview?: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                    }>;
                    mentions?: Array<{ accountId: string; name: string }>;
                    messageId: string;
                    quote?: {
                      attachment?: {
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      };
                      authorId: string;
                      body: string;
                      deleted?: boolean;
                      messageId?: string;
                    };
                    sentAt: number;
                    threadId?: string;
                    threadOnly?: boolean;
                  };
                  reactions: Array<{
                    accountId: string;
                    attachment?: number;
                    emoji: string;
                    link?: number;
                    messageId: string;
                    reactedAt: number;
                  }>;
                  seenAt?: number;
                  seenThrough?: number;
                }
              | {
                  at: number;
                  conversation: {
                    conversationId: string;
                    kind: "direct" | "group" | "channel";
                    members: Array<string>;
                    name: null | string;
                    spaceId: null | string;
                    spaceName?: string;
                  };
                  key: string;
                  kind: "mention";
                  message: {
                    attachments: Array<{
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    }>;
                    authorId: string;
                    authorName: string;
                    body: string;
                    conversationId: string;
                    deletedAt?: number;
                    editedAt?: number;
                    linkPreview: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                    linkPreviews?: Array<{
                      link: string;
                      preview?: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                    }>;
                    mentions?: Array<{ accountId: string; name: string }>;
                    messageId: string;
                    quote?: {
                      attachment?: {
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      };
                      authorId: string;
                      body: string;
                      deleted?: boolean;
                      messageId?: string;
                    };
                    sentAt: number;
                    threadId?: string;
                    threadOnly?: boolean;
                  };
                  seenAt?: number;
                  seenThrough?: number;
                }
              | {
                  at: number;
                  conversation: {
                    conversationId: string;
                    kind: "direct" | "group" | "channel";
                    members: Array<string>;
                    name: null | string;
                    spaceId: null | string;
                    spaceName?: string;
                  };
                  key: string;
                  kind: "reply";
                  message: {
                    attachments: Array<{
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    }>;
                    authorId: string;
                    authorName: string;
                    body: string;
                    conversationId: string;
                    deletedAt?: number;
                    editedAt?: number;
                    linkPreview: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                    linkPreviews?: Array<{
                      link: string;
                      preview?: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                    }>;
                    mentions?: Array<{ accountId: string; name: string }>;
                    messageId: string;
                    quote?: {
                      attachment?: {
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      };
                      authorId: string;
                      body: string;
                      deleted?: boolean;
                      messageId?: string;
                    };
                    sentAt: number;
                    threadId?: string;
                    threadOnly?: boolean;
                  };
                  seenAt?: number;
                  seenThrough?: number;
                }
              | {
                  at: number;
                  authors: Array<string>;
                  conversation: {
                    conversationId: string;
                    kind: "direct" | "group" | "channel";
                    members: Array<string>;
                    name: null | string;
                    spaceId: null | string;
                    spaceName?: string;
                  };
                  count: number;
                  key: string;
                  kind: "thread";
                  latest: {
                    attachments: Array<{
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    }>;
                    authorId: string;
                    authorName: string;
                    body: string;
                    conversationId: string;
                    deletedAt?: number;
                    editedAt?: number;
                    linkPreview: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                    linkPreviews?: Array<{
                      link: string;
                      preview?: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                    }>;
                    mentions?: Array<{ accountId: string; name: string }>;
                    messageId: string;
                    quote?: {
                      attachment?: {
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      };
                      authorId: string;
                      body: string;
                      deleted?: boolean;
                      messageId?: string;
                    };
                    sentAt: number;
                    threadId?: string;
                    threadOnly?: boolean;
                  };
                  root: null | {
                    attachments: Array<{
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    }>;
                    authorId: string;
                    authorName: string;
                    body: string;
                    conversationId: string;
                    deletedAt?: number;
                    editedAt?: number;
                    linkPreview: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                    linkPreviews?: Array<{
                      link: string;
                      preview?: null | {
                        description?: string;
                        imageUrl?: string;
                        siteName?: string;
                        title?: string;
                        url: string;
                        video?: {
                          durationMs?: number;
                          height?: number;
                          url: string;
                          width?: number;
                        };
                      };
                    }>;
                    mentions?: Array<{ accountId: string; name: string }>;
                    messageId: string;
                    quote?: {
                      attachment?: {
                        durationMs?: number;
                        height?: number;
                        kind: "image" | "video" | "file";
                        mimeType: string;
                        name: string;
                        size: number;
                        thumbnailUrl?: string;
                        url: string;
                        width?: number;
                      };
                      authorId: string;
                      body: string;
                      deleted?: boolean;
                      messageId?: string;
                    };
                    sentAt: number;
                    threadId?: string;
                    threadOnly?: boolean;
                  };
                  seenAt?: number;
                  seenThrough?: number;
                  threadId: string;
                }
            >;
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "notificationSettings";
            value: {
              channelAlerts?: "all" | "mentions" | "none";
              channels: boolean;
              directMessages: boolean;
              enabled: boolean;
              groupAlerts?: "all" | "mentions" | "none";
              groups: boolean;
              invites: boolean;
              reactions: boolean;
              replies?: boolean;
              threadReplies?: boolean;
              yourName?: boolean;
            };
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "conversation";
            value: null | {
              alerts?: "all" | "mentions" | "none";
              changedAt?: number;
              conversationId: string;
              kind: "direct" | "group" | "channel";
              lastMessage: null | {
                attachments: Array<{
                  durationMs?: number;
                  height?: number;
                  kind: "image" | "video" | "file";
                  mimeType: string;
                  name: string;
                  size: number;
                  thumbnailUrl?: string;
                  url: string;
                  width?: number;
                }>;
                authorId: string;
                authorName: string;
                body: string;
                conversationId: string;
                deletedAt?: number;
                editedAt?: number;
                linkPreview: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                  video?: {
                    durationMs?: number;
                    height?: number;
                    url: string;
                    width?: number;
                  };
                };
                linkPreviews?: Array<{
                  link: string;
                  preview?: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                }>;
                mentions?: Array<{ accountId: string; name: string }>;
                messageId: string;
                quote?: {
                  attachment?: {
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  };
                  authorId: string;
                  body: string;
                  deleted?: boolean;
                  messageId?: string;
                };
                sentAt: number;
                threadId?: string;
                threadOnly?: boolean;
              };
              members: Array<string>;
              muted: boolean;
              name: null | string;
              pinnedAt?: number;
              showInInbox?: boolean;
              spaceId: null | string;
              spaceName?: string;
              unreadCount: number;
              updatedAt: number;
            };
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "list";
            value: {
              hasNewer: boolean;
              hasOlder: boolean;
              messages: Array<{
                attachments: Array<{
                  durationMs?: number;
                  height?: number;
                  kind: "image" | "video" | "file";
                  mimeType: string;
                  name: string;
                  size: number;
                  thumbnailUrl?: string;
                  url: string;
                  width?: number;
                }>;
                authorId: string;
                authorName: string;
                body: string;
                conversationId: string;
                deletedAt?: number;
                editedAt?: number;
                linkPreview: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                  video?: {
                    durationMs?: number;
                    height?: number;
                    url: string;
                    width?: number;
                  };
                };
                linkPreviews?: Array<{
                  link: string;
                  preview?: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                }>;
                mentions?: Array<{ accountId: string; name: string }>;
                messageId: string;
                quote?: {
                  attachment?: {
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  };
                  authorId: string;
                  body: string;
                  deleted?: boolean;
                  messageId?: string;
                };
                sentAt: number;
                threadId?: string;
                threadOnly?: boolean;
              }>;
            };
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "memberEvents";
            value: Array<{
              accountId: string;
              at: number;
              by?: string;
              eventId: string;
              kind: "joined" | "left";
            }>;
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "reactions";
            value: Array<{
              accountId: string;
              attachment?: number;
              emoji: string;
              link?: number;
              messageId: string;
              reactedAt: number;
            }>;
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "typing";
            value: Array<{
              accountId: string;
              expiresIn: number;
              startedAt: number;
              typedAt: number;
            }>;
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "thread";
            value: {
              hasNewer: boolean;
              hasOlder: boolean;
              messages: Array<{
                attachments: Array<{
                  durationMs?: number;
                  height?: number;
                  kind: "image" | "video" | "file";
                  mimeType: string;
                  name: string;
                  size: number;
                  thumbnailUrl?: string;
                  url: string;
                  width?: number;
                }>;
                authorId: string;
                authorName: string;
                body: string;
                conversationId: string;
                deletedAt?: number;
                editedAt?: number;
                linkPreview: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                  video?: {
                    durationMs?: number;
                    height?: number;
                    url: string;
                    width?: number;
                  };
                };
                linkPreviews?: Array<{
                  link: string;
                  preview?: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                }>;
                mentions?: Array<{ accountId: string; name: string }>;
                messageId: string;
                quote?: {
                  attachment?: {
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  };
                  authorId: string;
                  body: string;
                  deleted?: boolean;
                  messageId?: string;
                };
                sentAt: number;
                threadId?: string;
                threadOnly?: boolean;
              }>;
              root: null | {
                attachments: Array<{
                  durationMs?: number;
                  height?: number;
                  kind: "image" | "video" | "file";
                  mimeType: string;
                  name: string;
                  size: number;
                  thumbnailUrl?: string;
                  url: string;
                  width?: number;
                }>;
                authorId: string;
                authorName: string;
                body: string;
                conversationId: string;
                deletedAt?: number;
                editedAt?: number;
                linkPreview: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                  video?: {
                    durationMs?: number;
                    height?: number;
                    url: string;
                    width?: number;
                  };
                };
                linkPreviews?: Array<{
                  link: string;
                  preview?: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                }>;
                mentions?: Array<{ accountId: string; name: string }>;
                messageId: string;
                quote?: {
                  attachment?: {
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  };
                  authorId: string;
                  body: string;
                  deleted?: boolean;
                  messageId?: string;
                };
                sentAt: number;
                threadId?: string;
                threadOnly?: boolean;
              };
            };
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "threadSummaries";
            value: Array<{
              lastReplyAt: number;
              repliers: Array<string>;
              replyCount: number;
              threadId: string;
            }>;
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "threads";
            value: {
              hasMore: boolean;
              threads: Array<{
                conversationId: string;
                following: boolean;
                lastReadAt: null | number;
                lastReplyAt: number;
                repliers: Array<string>;
                replyCount: number;
                root: null | {
                  attachments: Array<{
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  }>;
                  authorId: string;
                  authorName: string;
                  body: string;
                  conversationId: string;
                  deletedAt?: number;
                  editedAt?: number;
                  linkPreview: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                  linkPreviews?: Array<{
                    link: string;
                    preview?: null | {
                      description?: string;
                      imageUrl?: string;
                      siteName?: string;
                      title?: string;
                      url: string;
                      video?: {
                        durationMs?: number;
                        height?: number;
                        url: string;
                        width?: number;
                      };
                    };
                  }>;
                  mentions?: Array<{ accountId: string; name: string }>;
                  messageId: string;
                  quote?: {
                    attachment?: {
                      durationMs?: number;
                      height?: number;
                      kind: "image" | "video" | "file";
                      mimeType: string;
                      name: string;
                      size: number;
                      thumbnailUrl?: string;
                      url: string;
                      width?: number;
                    };
                    authorId: string;
                    body: string;
                    deleted?: boolean;
                    messageId?: string;
                  };
                  sentAt: number;
                  threadId?: string;
                  threadOnly?: boolean;
                };
                threadId: string;
                unreadCount: number;
              }>;
            };
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "inboxThreads";
            value: Array<{
              conversation: {
                conversationId: string;
                kind: "direct" | "group" | "channel";
                members: Array<string>;
                name: null | string;
                spaceId: null | string;
                spaceName?: string;
              };
              conversationId: string;
              following: boolean;
              lastReadAt: null | number;
              lastReplyAt: number;
              latest: null | {
                attachments: Array<{
                  durationMs?: number;
                  height?: number;
                  kind: "image" | "video" | "file";
                  mimeType: string;
                  name: string;
                  size: number;
                  thumbnailUrl?: string;
                  url: string;
                  width?: number;
                }>;
                authorId: string;
                authorName: string;
                body: string;
                conversationId: string;
                deletedAt?: number;
                editedAt?: number;
                linkPreview: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                  video?: {
                    durationMs?: number;
                    height?: number;
                    url: string;
                    width?: number;
                  };
                };
                linkPreviews?: Array<{
                  link: string;
                  preview?: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                }>;
                mentions?: Array<{ accountId: string; name: string }>;
                messageId: string;
                quote?: {
                  attachment?: {
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  };
                  authorId: string;
                  body: string;
                  deleted?: boolean;
                  messageId?: string;
                };
                sentAt: number;
                threadId?: string;
                threadOnly?: boolean;
              };
              repliers: Array<string>;
              replyCount: number;
              root: null | {
                attachments: Array<{
                  durationMs?: number;
                  height?: number;
                  kind: "image" | "video" | "file";
                  mimeType: string;
                  name: string;
                  size: number;
                  thumbnailUrl?: string;
                  url: string;
                  width?: number;
                }>;
                authorId: string;
                authorName: string;
                body: string;
                conversationId: string;
                deletedAt?: number;
                editedAt?: number;
                linkPreview: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                  video?: {
                    durationMs?: number;
                    height?: number;
                    url: string;
                    width?: number;
                  };
                };
                linkPreviews?: Array<{
                  link: string;
                  preview?: null | {
                    description?: string;
                    imageUrl?: string;
                    siteName?: string;
                    title?: string;
                    url: string;
                    video?: {
                      durationMs?: number;
                      height?: number;
                      url: string;
                      width?: number;
                    };
                  };
                }>;
                mentions?: Array<{ accountId: string; name: string }>;
                messageId: string;
                quote?: {
                  attachment?: {
                    durationMs?: number;
                    height?: number;
                    kind: "image" | "video" | "file";
                    mimeType: string;
                    name: string;
                    size: number;
                    thumbnailUrl?: string;
                    url: string;
                    width?: number;
                  };
                  authorId: string;
                  body: string;
                  deleted?: boolean;
                  messageId?: string;
                };
                sentAt: number;
                threadId?: string;
                threadOnly?: boolean;
              };
              threadId: string;
              unreadCount: number;
            }>;
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "threadState";
            value: { following: boolean; lastReadAt: null | number };
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "linkPreviews";
            value: Array<{
              link: string;
              preview?: null | {
                description?: string;
                imageUrl?: string;
                siteName?: string;
                title?: string;
                url: string;
                video?: {
                  durationMs?: number;
                  height?: number;
                  url: string;
                  width?: number;
                };
              };
            }>;
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "spaces";
            value: Array<{
              alerts?: "all" | "mentions" | "none";
              channels: Array<{
                alerts?: "all" | "mentions" | "none";
                conversationId: string;
                muted?: boolean;
                name: string;
                position: number;
                showInInbox?: boolean;
                unreadCount: number;
              }>;
              invited?: Array<string>;
              joinedAt?: number;
              members: Array<{ accountId: string; role: "owner" | "member" }>;
              muted?: boolean;
              name: string;
              role: "owner" | "member";
              spaceId: string;
              unreadCount: number;
            }>;
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "space";
            value: null | {
              alerts?: "all" | "mentions" | "none";
              channels: Array<{
                alerts?: "all" | "mentions" | "none";
                conversationId: string;
                muted?: boolean;
                name: string;
                position: number;
                showInInbox?: boolean;
                unreadCount: number;
              }>;
              invited?: Array<string>;
              joinedAt?: number;
              members: Array<{ accountId: string; role: "owner" | "member" }>;
              muted?: boolean;
              name: string;
              role: "owner" | "member";
              spaceId: string;
              unreadCount: number;
            };
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "spaceInvites";
            value: Array<{
              invitedAt: number;
              invitedBy: string;
              memberCount: number;
              name: string;
              spaceId: string;
            }>;
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "spaceInviteLinks";
            value: Array<{
              code: string;
              createdAt: number;
              createdBy: string;
              expiresAt: null | number;
            }>;
          }
        | {
            include?: Array<{
              lastChanged: string;
              operation: { args: any; type: string };
              plugin: string;
              version: string;
            }>;
            routes?: Array<string>;
            type: "spaceInviteLinkPreview";
            value: null | {
              expiresAt: null | number;
              isMember: boolean;
              memberCount: number;
              name: string;
              spaceId: string;
            };
          },
        Name
      >;
    };
    history: {
      importHistory: FunctionReference<
        "mutation",
        "internal",
        {
          conversationId: string;
          messages: Array<{
            attachments: Array<{
              durationMs?: number;
              height?: number;
              kind: "image" | "video" | "file";
              mimeType: string;
              name: string;
              size: number;
              thumbnailUrl?: string;
              url: string;
              width?: number;
            }>;
            authorId: string;
            authorName: string;
            body: string;
            messageId: string;
            sentAt: number;
          }>;
        },
        any,
        Name
      >;
    };
  };
