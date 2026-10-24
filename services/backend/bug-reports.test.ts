import assert from "node:assert/strict";
import { test } from "node:test";

import type { IssueState } from "./bug-reports.ts";
import {
  anonymize,
  isNewStage,
  issueFor,
  newestTag,
  platformOf,
  progressOf,
  releaseNeeds,
  updateMessage,
} from "./bug-reports.ts";
import {
  closingCommentOf,
  duplicateOf,
  SUPPORT_COMMENT,
} from "./issue-closures.ts";

const reporter = "maya@vera.chat";

void test("anonymize removes addresses, handles, numbers, links, and the reporter's name", () => {
  const text =
    "Maya sent a photo to leo@vera.chat and @priya, call +1 (555) 123-4567, see https://example.com/private?token=abc";
  assert.equal(
    anonymize(text, reporter),
    "[reporter] sent a photo to [address] and [name], call [number], see [link]",
  );
});

void test("anonymize leaves ordinary text alone", () => {
  assert.equal(
    anonymize("Photos taken in portrait show sideways in groups", reporter),
    "Photos taken in portrait show sideways in groups",
  );
});

void test("an issue keeps app details but never the reporter", () => {
  const { body, title } = issueFor(
    {
      details: "maya@vera.chat says photos rotate",
      steps: "Send a portrait photo in a group",
      title: "Photos sideways for maya",
    },
    reporter,
    {
      appVersion: "0.1.0 (9)",
      channel: "production",
      device: "iPhone 17 Pro",
      os: "iOS 26.1",
      update: "1a2b3c4d",
    },
  );
  assert.equal(title, "Photos sideways for [reporter]");
  assert.ok(!body.includes("maya"));
  assert.ok(body.includes("- Version: 0.1.0 (9)"));
  assert.ok(body.includes("## Steps to reproduce"));
  assert.ok(!body.includes("## Expected"));
});

const openIssue: IssueState = {
  assigned: false,
  closingComment: null,
  closingCommit: null,
  duplicateOf: null,
  pullRequests: [],
  state: "OPEN",
  stateReason: null,
};
const pr = { number: 7, url: "https://github.com/o/r/pull/7" };

void test("an issue's stage follows assignment, pull requests, and merges", () => {
  assert.equal(progressOf(openIssue).stage, "reported");
  assert.equal(progressOf({ ...openIssue, assigned: true }).stage, "pickedUp");
  const open = {
    mergeCommit: null,
    merged: false,
    native: false,
    open: true,
    paths: [],
    ref: pr,
  };
  assert.deepEqual(progressOf({ ...openIssue, pullRequests: [open] }), {
    pullRequest: pr,
    stage: "inProgress",
  });
  const merged = {
    ...open,
    mergeCommit: "abc",
    merged: true,
    open: false,
    paths: ["apps/mobile/src/x.tsx"],
  };
  assert.deepEqual(
    progressOf({ ...openIssue, pullRequests: [merged], state: "CLOSED" }),
    {
      fix: { app: true, backend: false, native: false, sha: "abc" },
      pullRequest: pr,
      stage: "fixed",
    },
  );
});

void test("closed issues: not planned, by a commit, or just closed", () => {
  const closed = { ...openIssue, state: "CLOSED" as const };
  assert.equal(
    progressOf({ ...closed, stateReason: "NOT_PLANNED" }).stage,
    "closed",
  );
  assert.equal(
    progressOf({ ...closed, stateReason: "DUPLICATE" }).stage,
    "closed",
  );
  assert.deepEqual(
    progressOf({ ...closed, closingCommit: "def", stateReason: "COMPLETED" }),
    {
      fix: { app: true, backend: true, native: false, sha: "def" },
      stage: "fixed",
    },
  );
  assert.equal(
    progressOf({ ...closed, stateReason: "COMPLETED" }).stage,
    "live",
  );
});

void test("a fix needs the releases its files ship in", () => {
  assert.deepEqual(releaseNeeds(["apps/mobile/a.tsx"]), {
    app: true,
    backend: false,
  });
  assert.deepEqual(releaseNeeds(["services/backend/convex/a.ts"]), {
    app: false,
    backend: true,
  });
  assert.deepEqual(
    releaseNeeds(["packages/decentralized-convex-messages/a.ts"]),
    {
      app: true,
      backend: true,
    },
  );
  assert.deepEqual(releaseNeeds(["docs/a.md"]), { app: true, backend: false });
});

void test("newest tag sorts timestamps as text and builds as numbers", () => {
  assert.equal(
    newestTag([
      "mobile/ota/production/20261017T020159",
      "mobile/ota/production/20261017T191958",
      "mobile/ota/production/20261016T221143",
    ]),
    "mobile/ota/production/20261017T191958",
  );
  assert.equal(
    newestTag(["mobile/build/9", "mobile/build/10", "mobile/build/8"]),
    "mobile/build/10",
  );
  assert.equal(newestTag([]), null);
});

void test("only later stages are news, and skipped ones aren't sent", () => {
  assert.equal(isNewStage("reported", "live"), true);
  assert.equal(isNewStage("fixed", "inProgress"), false);
  assert.equal(isNewStage("live", "closed"), false);
});

void test("updates are plain for most people and add links for developers", () => {
  const context = {
    developer: false,
    issueUrl: "https://github.com/o/r/issues/3",
    pullRequest: pr,
    summary: "photos showing sideways",
  };
  assert.equal(updateMessage("reported", context), null);
  const plain = updateMessage("inProgress", context);
  assert.equal(
    plain,
    "We're working on a fix for the bug you reported (photos showing sideways).",
  );
  assert.ok(!/github|issue|PR/i.test(plain));
  assert.equal(
    updateMessage("inProgress", { ...context, developer: true }),
    `${plain}\nPR: ${pr.url}`,
  );
  assert.match(
    updateMessage("live", { ...context, delivery: "update" }) ?? "",
    /is live now\.$/,
  );
  assert.match(
    updateMessage("live", { ...context, delivery: "build", platform: "ios" }) ??
      "",
    /Update it from TestFlight or the App Store/,
  );
  assert.match(
    updateMessage("live", {
      ...context,
      delivery: "build",
      platform: "android",
    }) ?? "",
    /Update it from Google Play/,
  );
});

void test("a reporter's phone comes from the OS their app reports", () => {
  assert.equal(platformOf("iOS 26.1"), "ios");
  assert.equal(platformOf("Android 16"), "android");
  assert.equal(platformOf(undefined), null);
});

void test("a native fix is marked from its PR's label", () => {
  const nativePr = {
    mergeCommit: "abc",
    merged: true,
    native: true,
    open: false,
    paths: ["apps/mobile/app.config.ts"],
    ref: pr,
  };
  assert.equal(
    progressOf({ ...openIssue, pullRequests: [nativePr] }).fix?.native,
    true,
  );
});

void test("the closing comment is the team's, around when it closed", () => {
  const closedAt = "2026-10-20T12:00:00Z";
  function comment(
    association: string,
    createdAt: string,
    body = "Works as intended: reactions stay in Activity.",
  ) {
    return { association, body, createdAt };
  }
  assert.equal(
    closingCommentOf([comment("OWNER", "2026-10-20T11:59:00Z")], closedAt),
    "Works as intended: reactions stay in Activity.",
  );
  // Not someone outside the team, not support itself, not long before.
  assert.equal(
    closingCommentOf([comment("NONE", "2026-10-20T11:59:00Z")], closedAt),
    null,
  );
  assert.equal(
    closingCommentOf(
      [
        comment(
          "OWNER",
          "2026-10-20T11:59:00Z",
          `${SUPPORT_COMMENT.another}\n\nsame here`,
        ),
      ],
      closedAt,
    ),
    null,
  );
  assert.equal(
    closingCommentOf([comment("OWNER", "2026-10-19T09:00:00Z")], closedAt),
    null,
  );
  assert.equal(closingCommentOf([], null), null);
});

void test("a duplicate's original comes from the latest marking that stands", () => {
  function marked(canonical: number, duplicate: number) {
    return { canonical, duplicate, marked: true };
  }
  assert.equal(duplicateOf([marked(12, 30)], 30), 12);
  // Where this issue is the original, it isn't a duplicate of anything.
  assert.equal(duplicateOf([marked(30, 41)], 30), null);
  // Unmarked, then marked as a duplicate of another.
  assert.equal(
    duplicateOf(
      [marked(12, 30), { ...marked(12, 30), marked: false }, marked(15, 30)],
      30,
    ),
    15,
  );
  assert.equal(
    duplicateOf([marked(12, 30), { ...marked(12, 30), marked: false }], 30),
    null,
  );
});
