import assert from "node:assert/strict";
import test from "node:test";

import { fakeCtx } from "./fakeCtx.ts";
import {
  notificationSettings,
  setNotificationSettings,
  wantsPush,
} from "./settings.ts";

const ME = "me@vera.chat";

void test("every kind of push but your name is on until turned off", async () => {
  const { ctx } = fakeCtx({});
  assert.deepEqual(await notificationSettings(ctx, ME), {
    channelAlerts: "all",
    channels: true,
    directMessages: true,
    enabled: true,
    groupAlerts: "all",
    groups: true,
    invites: true,
    reactions: true,
    replies: true,
    threadReplies: true,
    yourName: false,
  });
  assert.equal(await wantsPush(ctx, ME, "reactions"), true);
});

void test("turns one kind off, leaving the rest", async () => {
  const { ctx } = fakeCtx({});
  await setNotificationSettings(ctx, ME, { reactions: false });
  await setNotificationSettings(ctx, ME, { invites: false });
  assert.equal(await wantsPush(ctx, ME, "reactions"), false);
  assert.equal(await wantsPush(ctx, ME, "invites"), false);
  assert.equal(await wantsPush(ctx, ME, "directMessages"), true);
  await setNotificationSettings(ctx, ME, { reactions: true });
  assert.equal(await wantsPush(ctx, ME, "reactions"), true);
});

void test("turning pushes off silences every kind", async () => {
  const { ctx } = fakeCtx({});
  await setNotificationSettings(ctx, ME, { enabled: false });
  assert.equal(await wantsPush(ctx, ME, "directMessages"), false);
  assert.equal(await wantsPush(ctx, ME, "invites"), false);
  // Each kind keeps its own setting for when pushes come back.
  assert.equal((await notificationSettings(ctx, ME)).directMessages, true);
});

void test("default alerts keep the older switches in step", async () => {
  const { ctx } = fakeCtx({});
  await setNotificationSettings(ctx, ME, { groupAlerts: "mentions" });
  let settings = await notificationSettings(ctx, ME);
  assert.equal(settings.groupAlerts, "mentions");
  assert.equal(settings.groups, true);

  await setNotificationSettings(ctx, ME, { channelAlerts: "none" });
  settings = await notificationSettings(ctx, ME);
  assert.equal(settings.channelAlerts, "none");
  assert.equal(settings.channels, false);

  // An older app's switch replaces the level.
  await setNotificationSettings(ctx, ME, { groups: false });
  settings = await notificationSettings(ctx, ME);
  assert.equal(settings.groupAlerts, "none");
  await setNotificationSettings(ctx, ME, { channels: true });
  assert.equal((await notificationSettings(ctx, ME)).channelAlerts, "all");
});

void test("a switch turned off before alert levels means none", async () => {
  const { ctx } = fakeCtx({
    notificationSettings: [{ accountId: ME, groups: false }],
  });
  const settings = await notificationSettings(ctx, ME);
  assert.equal(settings.groupAlerts, "none");
  assert.equal(settings.channelAlerts, "all");
});
