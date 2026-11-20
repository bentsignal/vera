import assert from "node:assert/strict";
import test from "node:test";

import { clearBadge } from "./badgeClear.ts";
import { busyAccount, FRIEND, ME, NOW } from "./badges.testing.ts";
import { badgeCount } from "./badges.ts";
import { hasUnread } from "./chatMessages.ts";
import { fakeCtx } from "./fakeCtx.ts";
import { findAccess } from "./model.ts";
import { readPosition } from "./readStates.ts";

const SHOWS = { mentions: true, threads: true };

void test("clearing the badge leaves only pending invitations, for every app", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const account = busyAccount();
  const { ctx } = fakeCtx({
    ...account,
    spaceInvites: [{ accountId: ME, invitedBy: FRIEND, spaceId: "space:a" }],
  });
  const apps = [
    () => badgeCount(ctx, ME, SHOWS, ["chats", "channels", "threads"]),
    () => badgeCount(ctx, ME, SHOWS, ["chats"]),
    // Older apps, whose Activity lists conversations.
    () => badgeCount(ctx, ME, SHOWS),
    () => badgeCount(ctx, ME, { mentions: true }),
  ];
  for (const count of apps) assert.ok((await count()) > 1);

  t.mock.timers.tick(1000);
  await clearBadge(ctx, ME);
  for (const count of apps) assert.equal(await count(), 1);

  // What the badge doesn't count keeps its unread dot: a muted group.
  const muted = await findAccess(ctx, "group:7", ME);
  assert.ok(muted);
  const readAt = await readPosition(ctx, muted, ME);
  assert.ok(await hasUnread(ctx, "group:7", ME, readAt));
});
