/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as activityScope from "../activityScope.js";
import type * as activityShapes from "../activityShapes.js";
import type * as agents from "../agents.js";
import type * as alertChoice from "../alertChoice.js";
import type * as alerts from "../alerts.js";
import type * as badges from "../badges.js";
import type * as chatMessages from "../chatMessages.js";
import type * as conversations from "../conversations.js";
import type * as delivery from "../delivery.js";
import type * as dispatcher from "../dispatcher.js";
import type * as fakeCtx from "../fakeCtx.js";
import type * as history from "../history.js";
import type * as inbox from "../inbox.js";
import type * as index from "../index.js";
import type * as invites from "../invites.js";
import type * as linkCache from "../linkCache.js";
import type * as links from "../links.js";
import type * as listeners from "../listeners.js";
import type * as mentions from "../mentions.js";
import type * as metadata from "../metadata.js";
import type * as model from "../model.js";
import type * as naming from "../naming.js";
import type * as notifications from "../notifications.js";
import type * as opengraph from "../opengraph.js";
import type * as paging from "../paging.js";
import type * as personalActivity from "../personalActivity.js";
import type * as previews from "../previews.js";
import type * as protocol from "../protocol.js";
import type * as pushParts from "../pushParts.js";
import type * as pushTokens from "../pushTokens.js";
import type * as queries from "../queries.js";
import type * as reactionPush from "../reactionPush.js";
import type * as reactions from "../reactions.js";
import type * as sending from "../sending.js";
import type * as settings from "../settings.js";
import type * as shapes from "../shapes.js";
import type * as sightings from "../sightings.js";
import type * as sites from "../sites.js";
import type * as spaces from "../spaces.js";
import type * as threadLists from "../threadLists.js";
import type * as threadOperations from "../threadOperations.js";
import type * as threads from "../threads.js";
import type * as typing from "../typing.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  activity: typeof activity;
  activityScope: typeof activityScope;
  activityShapes: typeof activityShapes;
  agents: typeof agents;
  alertChoice: typeof alertChoice;
  alerts: typeof alerts;
  badges: typeof badges;
  chatMessages: typeof chatMessages;
  conversations: typeof conversations;
  delivery: typeof delivery;
  dispatcher: typeof dispatcher;
  fakeCtx: typeof fakeCtx;
  history: typeof history;
  inbox: typeof inbox;
  index: typeof index;
  invites: typeof invites;
  linkCache: typeof linkCache;
  links: typeof links;
  listeners: typeof listeners;
  mentions: typeof mentions;
  metadata: typeof metadata;
  model: typeof model;
  naming: typeof naming;
  notifications: typeof notifications;
  opengraph: typeof opengraph;
  paging: typeof paging;
  personalActivity: typeof personalActivity;
  previews: typeof previews;
  protocol: typeof protocol;
  pushParts: typeof pushParts;
  pushTokens: typeof pushTokens;
  queries: typeof queries;
  reactionPush: typeof reactionPush;
  reactions: typeof reactions;
  sending: typeof sending;
  settings: typeof settings;
  shapes: typeof shapes;
  sightings: typeof sightings;
  sites: typeof sites;
  spaces: typeof spaces;
  threadLists: typeof threadLists;
  threadOperations: typeof threadOperations;
  threads: typeof threads;
  typing: typeof typing;
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
