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
          operation: {
            args: { avatarUrl: null | string; displayName: string };
            type: "upsertMyProfile";
          };
          version: "1";
        },
        {
          routes?: Array<string>;
          type: "upsertMyProfile";
          value: {
            accountId: string;
            avatarUrl: null | string;
            displayName: string;
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
          operation:
            | { args: {}; type: "getMyProfile" }
            | { args: { accountId: string }; type: "getProfile" };
          version: "1";
        },
        | {
            routes?: Array<string>;
            type: "getMyProfile";
            value: null | {
              accountId: string;
              avatarUrl: null | string;
              displayName: string;
            };
          }
        | {
            routes?: Array<string>;
            type: "getProfile";
            value: null | {
              accountId: string;
              avatarUrl: null | string;
              displayName: string;
            };
          },
        Name
      >;
    };
  };
