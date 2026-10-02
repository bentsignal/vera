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
                args: { members: Array<string>; name: string };
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
                  messageId: string;
                };
                type: "send";
              }
            | {
                args: {
                  conversationId: string;
                  emoji: string;
                  messageId: string;
                  on: boolean;
                };
                type: "react";
              }
            | {
                args: { conversationId: string; readAt: number };
                type: "markRead";
              }
            | {
                args: { conversationId: string; muted: boolean };
                type: "setMuted";
              }
            | { args: { name: string }; type: "createSpace" }
            | { args: { name: string; spaceId: string }; type: "renameSpace" }
            | {
                args: { members: Array<string>; spaceId: string };
                type: "addSpaceMembers";
              }
            | {
                args: { accountId: string; spaceId: string };
                type: "removeSpaceMember";
              }
            | { args: { name: string; spaceId: string }; type: "createChannel" }
            | {
                args: { conversationId: string; name: string };
                type: "renameChannel";
              }
            | { args: { conversationId: string }; type: "deleteChannel" }
            | { args: { token: string }; type: "registerPushToken" }
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
              linkPreview: null | {
                description?: string;
                imageUrl?: string;
                siteName?: string;
                title?: string;
                url: string;
              };
              messageId: string;
              sentAt: number;
            };
          }
        | { routes?: Array<string>; type: "react"; value: null }
        | { routes?: Array<string>; type: "markRead"; value: null }
        | { routes?: Array<string>; type: "setMuted"; value: null }
        | {
            routes?: Array<string>;
            type: "createSpace";
            value: { spaceId: string };
          }
        | { routes?: Array<string>; type: "renameSpace"; value: null }
        | { routes?: Array<string>; type: "addSpaceMembers"; value: null }
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
            | { args: {}; type: "inbox" }
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
            | {
                args: { conversationId: string; messageIds: Array<string> };
                type: "reactions";
              }
            | { args: {}; type: "spaces" }
            | { args: { spaceId: string }; type: "space" };
          version: string;
        },
        | {
            routes?: Array<string>;
            type: "inbox";
            value: Array<{
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
                linkPreview: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                };
                messageId: string;
                sentAt: number;
              };
              members: Array<string>;
              muted: boolean;
              name: null | string;
              spaceId: null | string;
              unreadCount: number;
              updatedAt: number;
            }>;
          }
        | {
            routes?: Array<string>;
            type: "conversation";
            value: null | {
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
                linkPreview: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                };
                messageId: string;
                sentAt: number;
              };
              members: Array<string>;
              muted: boolean;
              name: null | string;
              spaceId: null | string;
              unreadCount: number;
              updatedAt: number;
            };
          }
        | {
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
                linkPreview: null | {
                  description?: string;
                  imageUrl?: string;
                  siteName?: string;
                  title?: string;
                  url: string;
                };
                messageId: string;
                sentAt: number;
              }>;
            };
          }
        | {
            routes?: Array<string>;
            type: "reactions";
            value: Array<{
              accountId: string;
              emoji: string;
              messageId: string;
              reactedAt: number;
            }>;
          }
        | {
            routes?: Array<string>;
            type: "spaces";
            value: Array<{
              channels: Array<{
                conversationId: string;
                name: string;
                position: number;
                unreadCount: number;
              }>;
              members: Array<{ accountId: string; role: "owner" | "member" }>;
              name: string;
              role: "owner" | "member";
              spaceId: string;
              unreadCount: number;
            }>;
          }
        | {
            routes?: Array<string>;
            type: "space";
            value: null | {
              channels: Array<{
                conversationId: string;
                name: string;
                position: number;
                unreadCount: number;
              }>;
              members: Array<{ accountId: string; role: "owner" | "member" }>;
              name: string;
              role: "owner" | "member";
              spaceId: string;
              unreadCount: number;
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
