/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as affiliations from "../affiliations.js";
import type * as agent from "../agent.js";
import type * as agentHistory from "../agentHistory.js";
import type * as agentTools from "../agentTools.js";
import type * as appAssociation from "../appAssociation.js";
import type * as assistantHook from "../assistantHook.js";
import type * as auth from "../auth.js";
import type * as bots from "../bots.js";
import type * as bunny from "../bunny.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as devBots from "../devBots.js";
import type * as devBusy from "../devBusy.js";
import type * as devChanges from "../devChanges.js";
import type * as devFullSeed from "../devFullSeed.js";
import type * as devMixed from "../devMixed.js";
import type * as devReleaseTest from "../devReleaseTest.js";
import type * as devSeed from "../devSeed.js";
import type * as devSignIn from "../devSignIn.js";
import type * as devSignInPage from "../devSignInPage.js";
import type * as devSupport from "../devSupport.js";
import type * as devThreads from "../devThreads.js";
import type * as files from "../files.js";
import type * as github from "../github.js";
import type * as githubIssues from "../githubIssues.js";
import type * as githubReleases from "../githubReleases.js";
import type * as http from "../http.js";
import type * as joinPage from "../joinPage.js";
import type * as lib from "../lib.js";
import type * as memory from "../memory.js";
import type * as memoryBuild from "../memoryBuild.js";
import type * as pds from "../pds.js";
import type * as rateLimits from "../rateLimits.js";
import type * as release from "../release.js";
import type * as sendLimits from "../sendLimits.js";
import type * as support from "../support.js";
import type * as supportAgent from "../supportAgent.js";
import type * as supportBugSync from "../supportBugSync.js";
import type * as supportClosures from "../supportClosures.js";
import type * as supportFollow from "../supportFollow.js";
import type * as supportKnownBugs from "../supportKnownBugs.js";
import type * as supportLookup from "../supportLookup.js";
import type * as supportReporters from "../supportReporters.js";
import type * as supportReports from "../supportReports.js";
import type * as supportRules from "../supportRules.js";
import type * as timeZones from "../timeZones.js";
import type * as usage from "../usage.js";
import type * as vera from "../vera.js";
import type * as webSearch from "../webSearch.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  affiliations: typeof affiliations;
  agent: typeof agent;
  agentHistory: typeof agentHistory;
  agentTools: typeof agentTools;
  appAssociation: typeof appAssociation;
  assistantHook: typeof assistantHook;
  auth: typeof auth;
  bots: typeof bots;
  bunny: typeof bunny;
  crons: typeof crons;
  dev: typeof dev;
  devBots: typeof devBots;
  devBusy: typeof devBusy;
  devChanges: typeof devChanges;
  devFullSeed: typeof devFullSeed;
  devMixed: typeof devMixed;
  devReleaseTest: typeof devReleaseTest;
  devSeed: typeof devSeed;
  devSignIn: typeof devSignIn;
  devSignInPage: typeof devSignInPage;
  devSupport: typeof devSupport;
  devThreads: typeof devThreads;
  files: typeof files;
  github: typeof github;
  githubIssues: typeof githubIssues;
  githubReleases: typeof githubReleases;
  http: typeof http;
  joinPage: typeof joinPage;
  lib: typeof lib;
  memory: typeof memory;
  memoryBuild: typeof memoryBuild;
  pds: typeof pds;
  rateLimits: typeof rateLimits;
  release: typeof release;
  sendLimits: typeof sendLimits;
  support: typeof support;
  supportAgent: typeof supportAgent;
  supportBugSync: typeof supportBugSync;
  supportClosures: typeof supportClosures;
  supportFollow: typeof supportFollow;
  supportKnownBugs: typeof supportKnownBugs;
  supportLookup: typeof supportLookup;
  supportReporters: typeof supportReporters;
  supportReports: typeof supportReports;
  supportRules: typeof supportRules;
  timeZones: typeof timeZones;
  usage: typeof usage;
  vera: typeof vera;
  webSearch: typeof webSearch;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  accounts: import("@decentralized-convex/accounts/_generated/component.js").ComponentApi<"accounts">;
  messages: import("@decentralized-convex/messages/_generated/component.js").ComponentApi<"messages">;
};
