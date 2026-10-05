/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as conversations from "../conversations.js";
import type * as dispatcher from "../dispatcher.js";
import type * as history from "../history.js";
import type * as inbox from "../inbox.js";
import type * as index from "../index.js";
import type * as invites from "../invites.js";
import type * as links from "../links.js";
import type * as metadata from "../metadata.js";
import type * as model from "../model.js";
import type * as notifications from "../notifications.js";
import type * as paging from "../paging.js";
import type * as previews from "../previews.js";
import type * as protocol from "../protocol.js";
import type * as pushTokens from "../pushTokens.js";
import type * as reactions from "../reactions.js";
import type * as spaces from "../spaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  conversations: typeof conversations;
  dispatcher: typeof dispatcher;
  history: typeof history;
  inbox: typeof inbox;
  index: typeof index;
  invites: typeof invites;
  links: typeof links;
  metadata: typeof metadata;
  model: typeof model;
  notifications: typeof notifications;
  paging: typeof paging;
  previews: typeof previews;
  protocol: typeof protocol;
  pushTokens: typeof pushTokens;
  reactions: typeof reactions;
  spaces: typeof spaces;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
