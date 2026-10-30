// Bug reports from Vera (convex/supportAgent.ts): what goes in a
// public GitHub issue, how far a fix has come, and what the reporter hears.
// Plain functions, so they can be tested without Convex.

export type ReportStage =
  | "reported"
  | "pickedUp"
  | "inProgress"
  | "fixed"
  | "live"
  | "closed";

const STAGE_RANK: Record<ReportStage, number> = {
  reported: 0,
  pickedUp: 1,
  inProgress: 2,
  fixed: 3,
  live: 4,
  closed: 4,
};

/** Whether `next` is news to someone who last heard about `previous`. */
export function isNewStage(previous: ReportStage, next: ReportStage) {
  return STAGE_RANK[next] > STAGE_RANK[previous];
}

/** Stages after which there's nothing left to follow. */
export function isFinalStage(stage: ReportStage) {
  return stage === "live" || stage === "closed";
}

const ADDRESS = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const HANDLE = /(^|[^\w@])@[\w.-]+/g;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const URL_WITH_PATH = /https?:\/\/\S+/g;

/**
 * Removes what could identify someone from text going into a public issue:
 * addresses and emails, @handles, phone numbers, links, and the reporter's
 * username. The model is told to leave these out too; this catches what it
 * misses.
 */
export function anonymize(text: string, reporter: string) {
  const username = reporter.slice(0, reporter.lastIndexOf("@"));
  let result = text
    .replace(ADDRESS, "[address]")
    .replace(URL_WITH_PATH, "[link]")
    .replace(HANDLE, "$1[name]")
    .replace(PHONE, "[number]");
  if (username.length >= 3) {
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[reporter]");
  }
  return result.trim();
}

export interface ClientDetails {
  readonly appVersion: string;
  readonly channel: string;
  readonly device: string;
  readonly os: string;
  readonly update: string;
}

export interface IssueContent {
  readonly actual?: string;
  readonly details: string;
  readonly expected?: string;
  readonly steps?: string;
  readonly title: string;
}

/** The public issue's title and body, anonymized. */
export function issueFor(
  content: IssueContent,
  reporter: string,
  client: ClientDetails | null,
) {
  function section(heading: string, text: string | undefined) {
    return text === undefined || text.trim().length === 0
      ? []
      : [`## ${heading}`, "", anonymize(text, reporter), ""];
  }
  const lines = [
    ...section("What happened", content.details),
    ...section("Steps to reproduce", content.steps),
    ...section("Expected", content.expected),
    ...section("Actual", content.actual),
  ];
  lines.push("## App", "");
  if (client === null) {
    lines.push("Unknown (the reporter's app is too old to send it).");
  } else {
    lines.push(
      `- Version: ${client.appVersion}`,
      `- Update: ${client.update} (${client.channel})`,
      `- Device: ${client.device}, ${client.os}`,
    );
  }
  lines.push(
    "",
    "---",
    "",
    "Reported in the app through Vera, which describes any screenshots in words instead of posting them. The reporter was told this is public; their identity is kept private.",
  );
  return {
    body: lines.join("\n"),
    title: anonymize(content.title, reporter).slice(0, 200),
  };
}

export interface PullRequestRef {
  readonly number: number;
  readonly url: string;
}

/** What GitHub says about an issue, reduced to what decides its stage. */
export interface IssueState {
  readonly assigned: boolean;
  /** A commit that closed it directly, without a pull request. */
  readonly closingCommit: string | null;
  /** Pull requests that will close it or closed it. */
  readonly pullRequests: readonly {
    readonly mergeCommit: string | null;
    readonly merged: boolean;
    readonly open: boolean;
    /** CI labeled it "📱 Native Change": only a store build ships it. */
    readonly native: boolean;
    readonly paths: readonly string[];
    readonly ref: PullRequestRef;
  }[];
  readonly state: "OPEN" | "CLOSED";
  readonly stateReason: string | null;
  /** The team's comment on closing it, if they left one (`closingCommentOf`). */
  readonly closingComment: string | null;
  /** The issue this one was marked a duplicate of (`duplicateOf`). */
  readonly duplicateOf: number | null;
  /** Labeled "enhancement": an idea for something new, not a bug. */
  readonly idea: boolean;
}

/** GitHub's label for an idea (supportAgent.ts files ideas with it). */
export const IDEA_LABEL = "enhancement";

/** A fix's commit and what it needs before people have it. */
export interface Fix {
  readonly app: boolean;
  readonly backend: boolean;
  readonly native: boolean;
  readonly sha: string;
}

/** The phone a reporter uses, from the OS their app reports. */
export type Platform = "android" | "ios" | null;

export function platformOf(os: string | undefined): Platform {
  if (os === undefined) return null;
  if (/^ios/i.test(os)) return "ios";
  if (/^android/i.test(os)) return "android";
  return null;
}

export interface ReportProgress {
  readonly fix?: Fix;
  readonly pullRequest?: PullRequestRef;
  readonly stage: ReportStage;
}

/** How far an issue has come, from its GitHub state. */
export function progressOf(issue: IssueState): ReportProgress {
  const merged = issue.pullRequests.find(
    (pr) => pr.merged && pr.mergeCommit !== null,
  );
  if (merged?.mergeCommit) {
    return {
      fix: {
        ...releaseNeeds(merged.paths),
        native: merged.native,
        sha: merged.mergeCommit,
      },
      pullRequest: merged.ref,
      stage: "fixed",
    };
  }
  if (issue.state === "CLOSED") {
    const done =
      issue.stateReason !== "NOT_PLANNED" && issue.stateReason !== "DUPLICATE";
    if (done && issue.closingCommit !== null) {
      return {
        fix: {
          app: true,
          backend: true,
          native: false,
          sha: issue.closingCommit,
        },
        stage: "fixed",
      };
    }
    // Closed with nothing that changed it, even if marked completed:
    // closing a report as "completed" is also how the team says no.
    return { stage: "closed" };
  }
  const open = issue.pullRequests.find((pr) => pr.open);
  if (open !== undefined) return { pullRequest: open.ref, stage: "inProgress" };
  return { stage: issue.assigned ? "pickedUp" : "reported" };
}

/**
 * What a fix needs before people have it, from the files it changed: an
 * app release (over the air or a store build), a backend deploy, or both.
 */
export function releaseNeeds(paths: readonly string[]) {
  const backend = paths.some(
    (path) => path.startsWith("services/") || path.startsWith("packages/"),
  );
  const app = paths.some(
    (path) =>
      path.startsWith("apps/") ||
      path.startsWith("packages/") ||
      path.startsWith("shared/"),
  );
  return { app: app || !backend, backend };
}

/**
 * The newest release tag of a kind: timestamped tags
 * (`mobile/ota/production/20261017T191958`) sort as text, numbered ones
 * (`mobile/build/9`) as numbers.
 */
export function newestTag(tags: readonly string[]) {
  let newest: string | null = null;
  for (const tag of tags) {
    if (newest === null || compareTags(tag, newest) > 0) newest = tag;
  }
  return newest;
}

function compareTags(left: string, right: string) {
  const a = left.slice(left.lastIndexOf("/") + 1);
  const b = right.slice(right.lastIndexOf("/") + 1);
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) - Number(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** How a live fix reached people. */
export type Delivery = "update" | "build" | "server" | "unknown";

export interface UpdateContext {
  readonly delivery?: Delivery;
  readonly platform?: Platform;
  readonly developer: boolean;
  /** An idea for something new, not a bug: it gets built, not fixed. */
  readonly idea?: boolean;
  readonly issueUrl?: string;
  readonly pullRequest?: PullRequestRef;
  readonly release?: string;
  readonly sha?: string;
  readonly stateReason?: string | null;
  readonly summary: string;
}

/**
 * What support tells the reporter when their bug reaches a new stage, in
 * plain words; developers also get the links. Null for no message.
 */
export function updateMessage(stage: ReportStage, context: UpdateContext) {
  const lines = UPDATES[stage](context);
  return lines.length === 0 ? null : lines.join("\n");
}

/** Each stage's message, then a developer's link when there is one. */
const UPDATES: Record<ReportStage, (context: UpdateContext) => string[]> = {
  reported: () => [],
  pickedUp: (context) => [
    `Quick update on ${subject(context)}: someone on the team picked it up.`,
    ...developerLink(context, context.issueUrl),
  ],
  inProgress: (context) => [
    context.idea === true
      ? `We're working on ${subject(context)}.`
      : `We're working on a fix for ${subject(context)}.`,
    ...developerLink(
      context,
      context.pullRequest && `PR: ${context.pullRequest.url}`,
    ),
  ],
  fixed: (context) => [
    context.idea === true
      ? `${capitalized(subject(context))} is done. It will reach you in an upcoming update, and I'll tell you when it's out.`
      : `${capitalized(subject(context))} is fixed. The fix will reach you in an upcoming update, and I'll tell you when it's out.`,
    ...developerLink(
      context,
      context.pullRequest
        ? `Merged: ${context.pullRequest.url}`
        : context.sha && `Fixed in ${context.sha.slice(0, 7)}`,
    ),
  ],
  live: (context) => [
    liveMessage(context),
    ...developerLink(
      context,
      context.release && `Shipped in ${context.release}`,
    ),
  ],
  closed: (context) => [
    closedMessage(context),
    ...developerLink(context, context.issueUrl),
  ],
};

/** What the reporter sent, as messages name it. */
function subject({ idea, summary }: UpdateContext) {
  return idea === true
    ? `the idea you suggested (${summary})`
    : `the bug you reported (${summary})`;
}

function capitalized(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * A report closed with nothing that changed it. Closed as completed
 * without a fix says no more than closed: it never claims it's done.
 */
function closedMessage(context: UpdateContext) {
  const what = subject(context);
  const idea = context.idea === true;
  if (context.stateReason === "DUPLICATE") {
    return idea
      ? `Update on ${what}: it turned out to be the same as another idea the team already has.`
      : `Update on ${what}: it turned out to be the same as another report the team is already on.`;
  }
  if (context.stateReason === "NOT_PLANNED") {
    return idea
      ? `About ${what}: the team looked at it and isn't planning to build it for now. Thanks for suggesting it.`
      : `About ${what}: the team looked into it and isn't planning to change it for now. Thanks for flagging it.`;
  }
  return idea
    ? `About ${what}: the team closed it. Thanks for suggesting it.`
    : `About ${what}: the team closed it. If you still see it, tell me.`;
}

function developerLink(context: UpdateContext, line: string | undefined) {
  return context.developer && line ? [line] : [];
}

/** Where someone gets a store build, by their phone. */
const STORES: Record<NonNullable<Platform> | "unknown", string> = {
  android: "Google Play",
  ios: "TestFlight or the App Store",
  unknown: "your app store",
};

function liveMessage(context: UpdateContext) {
  const what = subject(context);
  const it = context.idea === true ? capitalized(what) : `The fix for ${what}`;
  switch (context.delivery ?? "unknown") {
    case "update":
    case "server":
      // An update over the air: reading this in Vera, they have it.
      return `${it} is live now.`;
    case "build":
      return `${it} is out in the newest version of Vera. Update it from ${STORES[context.platform ?? "unknown"]} to get it.`;
    case "unknown":
      return `${it} is out now.`;
  }
}
