import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The host's own tables. Messages and profiles live in their plugins; these
// hold what Vera's assistant accounts (bots.ts) keep for themselves.

/** How far a bug report has come, in order (see supportReports.ts). */
export const reportStage = v.union(
  v.literal("reported"),
  v.literal("pickedUp"),
  v.literal("inProgress"),
  v.literal("fixed"),
  v.literal("live"),
  v.literal("closed"),
);

/** Vera's assistant accounts by username (bots.ts). */
export const botName = v.union(v.literal("support"), v.literal("vera"));

export default defineSchema({
  /**
   * One per person's DM with an assistant: when its next reply runs and
   * whether one is running.
   */
  botConversations: defineTable({
    accountId: v.string(),
    /** The newest message of theirs a finished reply has seen. */
    answeredThrough: v.optional(v.number()),
    bot: botName,
    conversationId: v.string(),
    /**
     * Something the team wants the next reply to cover, such as why an
     * issue was closed (supportClosures.ts).
     */
    note: v.optional(v.string()),
    /** A message arrived while a reply was running: answer it next. */
    rerun: v.optional(v.boolean()),
    runningSince: v.optional(v.number()),
    /** When the reply started waiting for them to stop typing. */
    waitingSince: v.optional(v.number()),
    /** When the reply to the latest message runs; older wake-ups skip. */
    wakeAt: v.number(),
  }).index("by_conversation", ["conversationId"]),
  /** What an assistant remembers about one person, at their request. */
  botNotes: defineTable({
    accountId: v.string(),
    bot: botName,
    text: v.string(),
  }).index("by_bot_account", ["bot", "accountId"]),
  /**
   * The app version and device an account last wrote to support from,
   * reported by the app, for bug reports. Nothing else about the device.
   */
  clientInfo: defineTable({
    accountId: v.string(),
    appVersion: v.string(),
    channel: v.string(),
    device: v.string(),
    os: v.string(),
    reportedAt: v.number(),
    update: v.string(),
  }).index("by_account", ["accountId"]),
  /**
   * Vera's memory of each conversation: every 10 messages, with an
   * embedding to find it by meaning (memory.ts).
   */
  memoryPassages: defineTable({
    bot: botName,
    conversationId: v.string(),
    embedding: v.array(v.float64()),
    firstSentAt: v.number(),
    lastSentAt: v.number(),
    text: v.string(),
  })
    .index("by_conversation_last", ["conversationId", "lastSentAt"])
    .vectorIndex("by_embedding", {
      dimensions: 512,
      filterFields: ["conversationId"],
      vectorField: "embedding",
    }),
  /** Which passage each message is in, to rebuild it after an edit or delete. */
  memoryLinks: defineTable({
    messageId: v.string(),
    passageId: v.id("memoryPassages"),
  })
    .index("by_message", ["messageId"])
    .index("by_passage", ["passageId"]),
  /** Vera's web searches, kept a day for follow-ups (webSearch.ts). */
  webSearches: defineTable({
    accountId: v.string(),
    conversationId: v.string(),
    question: v.string(),
    results: v.array(
      v.object({
        excerpts: v.array(v.string()),
        publishDate: v.union(v.null(), v.string()),
        title: v.string(),
        url: v.string(),
      }),
    ),
  }).index("by_conversation", ["conversationId"]),
  /** Each person's hourly allowance of each assistant's replies (rateLimits.ts). */
  rateLimits: defineTable({
    accountId: v.string(),
    bot: botName,
    /** At the hourly limit since their last reply (one strike per stretch). */
    limited: v.optional(v.boolean()),
    lockNoticeSent: v.optional(v.boolean()),
    /** Times today they ran the hour dry, and when today's count began. */
    strikes: v.optional(v.number()),
    strikesSince: v.optional(v.number()),
    tokens: v.number(),
    updatedAt: v.number(),
  }).index("by_account", ["accountId", "bot"]),
  /** Each person's allowance of messages to send (sendLimits.ts). */
  sendLimits: defineTable({
    accountId: v.string(),
    tokens: v.number(),
    updatedAt: v.number(),
  }).index("by_account", ["accountId"]),
  /** What each assistant reply cost, for keeping an eye on the bill (usage.ts). */
  assistantUsage: defineTable({
    accountId: v.string(),
    bot: botName,
    /** Dollars, as the AI Gateway reports them, plus Parallel's search fee. */
    cost: v.number(),
    inputTokens: v.number(),
    memoryLookups: v.number(),
    ms: v.number(),
    outputTokens: v.number(),
    searches: v.number(),
    steps: v.number(),
  }).index("by_bot", ["bot"]),
  /** Each person's device time zone, from the app, for assistants' sense of time. */
  timeZones: defineTable({
    accountId: v.string(),
    timeZone: v.string(),
  }).index("by_account", ["accountId"]),
  /** What support knows about someone who reports bugs. */
  supportReporters: defineTable({
    accountId: v.string(),
    /** Whether they want technical details (GitHub links); unknown until asked. */
    developer: v.optional(v.boolean()),
    /** When support told them reports are public (`share_privacy_notice`). */
    noticeSharedAt: v.optional(v.number()),
  }).index("by_account", ["accountId"]),
  /**
   * A bug someone reported to support, and its GitHub issue: one per
   * person following it, whether they reported it first or after
   * (`bug`).
   */
  bugReports: defineTable({
    accountId: v.string(),
    /** The known bug this follows (supportKnownBugs.ts). */
    bug: v.optional(v.id("knownBugs")),
    conversationId: v.string(),
    /** The commit that fixed it and what it needs to reach people. */
    fix: v.optional(
      v.object({
        app: v.boolean(),
        backend: v.boolean(),
        native: v.optional(v.boolean()),
        sha: v.string(),
      }),
    ),
    issueNumber: v.optional(v.number()),
    issueUrl: v.optional(v.string()),
    /** The latest stage the reporter has heard about. */
    notifiedStage: reportStage,
    pullRequest: v.optional(v.object({ number: v.number(), url: v.string() })),
    stage: reportStage,
    /** A short, plain description for messages to the reporter. */
    summary: v.string(),
    title: v.string(),
    /** Still followed on GitHub (not live or closed yet). */
    tracking: v.boolean(),
  })
    .index("by_account", ["accountId"])
    .index("by_bug", ["bug"])
    .index("by_issue", ["issueNumber"])
    .index("by_tracking", ["tracking"]),
  /**
   * The team's known bugs and ideas, one per GitHub issue (or per report
   * kept on this PDS without GitHub): what support checks before filing,
   * with no wait for GitHub's search to catch up (supportKnownBugs.ts).
   */
  knownBugs: defineTable({
    /** Not settled yet: its issue is checked for progress. */
    active: v.boolean(),
    /** The issue's description, as public as the issue (anonymized when support filed it). */
    description: v.string(),
    /** The issue this was closed as a duplicate of. */
    duplicateOf: v.optional(v.number()),
    /** When GitHub last changed the issue, for the next sync. */
    githubUpdatedAt: v.optional(v.number()),
    issueNumber: v.optional(v.number()),
    issueUrl: v.optional(v.string()),
    kind: v.union(v.literal("bug"), v.literal("idea")),
    /** When it was first reported (the issue's creation). */
    reportedAt: v.number(),
    stage: reportStage,
    /** The first reporter's everyday phrase, when support filed it. */
    summary: v.optional(v.string()),
    title: v.string(),
  })
    .index("by_active", ["active"])
    .index("by_github_updated", ["githubUpdatedAt"])
    .index("by_issue", ["issueNumber"]),
});
