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
    affiliations: {
      listAffiliated: FunctionReference<
        "query",
        "internal",
        {},
        Array<string>,
        Name
      >;
      removeAccount: FunctionReference<
        "mutation",
        "internal",
        { accountId: string },
        null,
        Name
      >;
      setAffiliated: FunctionReference<
        "mutation",
        "internal",
        { accountId: string; affiliated: boolean },
        null,
        Name
      >;
    };
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
          operation: {
            args: {
              avatarUrl?: null | string;
              createOnly?: boolean;
              displayName?: string;
            };
            type: "upsertMyProfile";
          };
          version: string;
        },
        {
          routes?: Array<string>;
          type: "upsertMyProfile";
          value: {
            accountId: string;
            affiliated?: boolean;
            avatarUrl: null | string;
            displayName: string;
          };
        },
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
              type: "getMyProfile";
              value: null | {
                accountId: string;
                affiliated?: boolean;
                avatarUrl: null | string;
                displayName: string;
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
              type: "getProfile";
              value: null | {
                accountId: string;
                affiliated?: boolean;
                avatarUrl: null | string;
                displayName: string;
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
            | { args: {}; type: "getMyProfile" }
            | { args: { accountId: string }; type: "getProfile" };
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
            type: "getMyProfile";
            value: null | {
              accountId: string;
              affiliated?: boolean;
              avatarUrl: null | string;
              displayName: string;
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
            type: "getProfile";
            value: null | {
              accountId: string;
              affiliated?: boolean;
              avatarUrl: null | string;
              displayName: string;
            };
          },
        Name
      >;
    };
  };
