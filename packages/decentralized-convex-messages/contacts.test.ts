import assert from "node:assert/strict";
import test from "node:test";

import {
  contacts,
  messagePermission,
  privacySettings,
  removeContact,
  saveContact,
  setPrivacySettings,
  shownTo,
} from "./contacts.ts";
import { addGroupMembers, createGroup, openDirect } from "./conversations.ts";
import { fakeCtx } from "./fakeCtx.ts";

const ME = "me@vera.chat";
const MAYA = "maya@vera.chat";
const LEO = "leo@vera.chat";

function rejection(code: string) {
  return { data: { code } };
}

/** Each contact's address, and the name and photo given them. */
async function details(ctx: ReturnType<typeof fakeCtx>["ctx"]) {
  return (await contacts(ctx, ME)).map(({ accountId, avatarUrl, name }) => ({
    accountId,
    avatarUrl,
    name,
  }));
}

void test("adds a contact, then changes and clears its name and photo", async () => {
  const { ctx } = fakeCtx({});
  await saveContact(ctx, ME, { accountId: " Maya@Vera.chat " });
  assert.deepEqual(await details(ctx), [
    { accountId: MAYA, avatarUrl: undefined, name: undefined },
  ]);

  const photo = "https://media.vera.chat/dev/mom.jpg";
  await saveContact(ctx, ME, {
    accountId: MAYA,
    avatarUrl: photo,
    name: "Mom",
  });
  // Fields left out stay as they are.
  await saveContact(ctx, ME, { accountId: MAYA });
  assert.deepEqual(await details(ctx), [
    { accountId: MAYA, avatarUrl: photo, name: "Mom" },
  ]);
  assert.deepEqual(await shownTo(ctx, ME, [MAYA, LEO]), {
    [MAYA]: { avatarUrl: photo, name: "Mom" },
  });

  await saveContact(ctx, ME, { accountId: MAYA, avatarUrl: null, name: " " });
  assert.deepEqual(await details(ctx), [
    { accountId: MAYA, avatarUrl: undefined, name: undefined },
  ]);

  await removeContact(ctx, ME, { accountId: MAYA });
  assert.deepEqual(await contacts(ctx, ME), []);
});

void test("refuses yourself and photos that aren't https", async () => {
  const { ctx } = fakeCtx({});
  await assert.rejects(
    saveContact(ctx, ME, { accountId: ME }),
    rejection("INVALID_ADDRESS"),
  );
  await assert.rejects(
    saveContact(ctx, ME, { accountId: MAYA, avatarUrl: "http://x.test/a" }),
    rejection("INVALID_AVATAR_URL"),
  );
});

void test("everyone can message you until you choose", async () => {
  const { ctx } = fakeCtx({});
  assert.deepEqual(await privacySettings(ctx, MAYA), {
    messagesFrom: "everyone",
  });
  assert.deepEqual(await messagePermission(ctx, ME, MAYA), {
    direct: true,
    groups: true,
  });
  await openDirect(ctx, ME, { accountId: MAYA });
});

void test("contacts only: only people you added can start a conversation", async () => {
  const { ctx } = fakeCtx({});
  await setPrivacySettings(ctx, MAYA, { messagesFrom: "contacts" });
  assert.deepEqual(await messagePermission(ctx, ME, MAYA), {
    direct: false,
    groups: false,
  });
  await assert.rejects(
    openDirect(ctx, ME, { accountId: MAYA }),
    rejection("NOT_ACCEPTING_MESSAGES"),
  );
  await assert.rejects(
    createGroup(ctx, ME, { members: [MAYA, LEO] }),
    rejection("NOT_ACCEPTING_MESSAGES"),
  );

  // Maya adding me is enough; I don't have to add her.
  await saveContact(ctx, MAYA, { accountId: ME });
  assert.deepEqual(await messagePermission(ctx, ME, MAYA), {
    direct: true,
    groups: true,
  });
  await openDirect(ctx, ME, { accountId: MAYA });
});

void test("mutual: you have to have added each other", async () => {
  const { ctx } = fakeCtx({});
  await setPrivacySettings(ctx, MAYA, { messagesFrom: "mutual" });
  await saveContact(ctx, MAYA, { accountId: ME });
  assert.equal((await messagePermission(ctx, ME, MAYA)).direct, false);
  await saveContact(ctx, ME, { accountId: MAYA });
  assert.equal((await messagePermission(ctx, ME, MAYA)).direct, true);
});

void test("a conversation that exists stays open, so they can reply", async () => {
  const { ctx } = fakeCtx({});
  await setPrivacySettings(ctx, MAYA, { messagesFrom: "contacts" });
  // Maya messages me first, without adding me.
  await openDirect(ctx, MAYA, { accountId: ME });
  assert.deepEqual(await messagePermission(ctx, ME, MAYA), {
    direct: true,
    groups: false,
  });
  await openDirect(ctx, ME, { accountId: MAYA });
});

void test("people who don't accept you can't be added to a group", async () => {
  const { ctx } = fakeCtx({});
  const { conversationId } = await createGroup(ctx, ME, { members: [LEO] });
  await setPrivacySettings(ctx, MAYA, { messagesFrom: "contacts" });
  await assert.rejects(
    addGroupMembers(ctx, ME, { conversationId, members: [MAYA] }),
    rejection("NOT_ACCEPTING_MESSAGES"),
  );
  await saveContact(ctx, MAYA, { accountId: ME });
  await addGroupMembers(ctx, ME, { conversationId, members: [MAYA] });
});
