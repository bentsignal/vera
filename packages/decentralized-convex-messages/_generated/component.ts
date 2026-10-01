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
            | {
                args: { conversationId: string; participants: Array<string> };
                type: "putConversation";
              }
            | {
                args: {
                  body: string;
                  conversationId: string;
                  messageId: string;
                };
                type: "send";
              };
          version: string;
        },
        | {
            routes?: Array<string>;
            type: "putConversation";
            value: { conversationId: string; participants: Array<string> };
          }
        | {
            routes?: Array<string>;
            type: "send";
            value: {
              authorId: string;
              authorName: string;
              body: string;
              conversationId: string;
              messageId: string;
              sentAt: number;
            };
          },
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
          operation: { args: { conversationId: string }; type: "list" };
          version: string;
        },
        {
          routes?: Array<string>;
          type: "list";
          value: Array<{
            authorId: string;
            authorName: string;
            body: string;
            conversationId: string;
            messageId: string;
            sentAt: number;
          }>;
        },
        Name
      >;
    };
  };
