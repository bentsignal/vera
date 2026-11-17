import assert from "node:assert/strict";
import { test } from "node:test";

import { updateMessage } from "./bug-reports.ts";

// What Vera tells someone as their report moves along (bug-reports.ts).

const pr = { number: 7, url: "https://github.com/o/r/pull/7" };

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

void test("ideas are built and done, never fixed", () => {
  const context = {
    developer: false,
    idea: true,
    summary: "square profile pictures in stacked view",
  };
  const messages = [
    updateMessage("pickedUp", context),
    updateMessage("inProgress", context),
    updateMessage("fixed", context),
    updateMessage("live", { ...context, delivery: "update" }),
    updateMessage("live", { ...context, delivery: "build", platform: "ios" }),
    updateMessage("closed", { ...context, stateReason: "NOT_PLANNED" }),
    updateMessage("closed", { ...context, stateReason: "COMPLETED" }),
  ];
  for (const message of messages) {
    assert.match(
      message ?? "",
      /the idea you suggested \(square profile pictures in stacked view\)/i,
    );
    assert.doesNotMatch(message ?? "", /bug|fix/i);
  }
  assert.equal(
    updateMessage("fixed", context),
    "The idea you suggested (square profile pictures in stacked view) is done. It will reach you in an upcoming update, and I'll tell you when it's out.",
  );
  assert.equal(
    updateMessage("live", { ...context, delivery: "update" }),
    "The idea you suggested (square profile pictures in stacked view) is live now.",
  );
});

void test("a report closed with no fix never says it's fixed or done", () => {
  for (const idea of [false, true]) {
    const message = updateMessage("closed", {
      developer: false,
      idea,
      stateReason: "COMPLETED",
      summary: "square profile pictures in stacked view",
    });
    assert.match(message ?? "", /the team closed it\./);
    assert.doesNotMatch(message ?? "", /fixed|done|live|out now/i);
  }
});
