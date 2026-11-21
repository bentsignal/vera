import assert from "node:assert/strict";
import test from "node:test";

import { fakeCtx } from "./fakeCtx.ts";
import {
  createSpaceInviteLink,
  joinSpaceWithLink,
  spaceInviteLinkPreview,
} from "./invites.ts";
import { addSpaceMembers, removeSpaceMember } from "./spaces.ts";

const OWNER = "owner@vera.chat";
const MAYA = "maya@vera.chat";
const LEO = "leo@vera.chat";
const SPACE = "space:vera.chat:1";

function space() {
  return fakeCtx({
    spaces: [{ createdBy: OWNER, name: "Book club", spaceId: SPACE }],
    spaceMembers: [OWNER, MAYA, LEO].map((accountId) => ({
      accountId,
      role: accountId === OWNER ? "owner" : "member",
      spaceId: SPACE,
    })),
  });
}

type Fake = ReturnType<typeof space>;

async function newLink(fake: Fake, self: string, expiresIn?: number) {
  const { code } = await createSpaceInviteLink(fake.ctx, self, {
    expiresIn,
    spaceId: SPACE,
  });
  return code;
}

function isMember(fake: Fake, accountId: string) {
  return fake
    .rows("spaceMembers")
    .some((row) => row.spaceId === SPACE && row.accountId === accountId);
}

function remove(fake: Fake, self: string, accountId: string) {
  return removeSpaceMember(fake.ctx, self, { accountId, spaceId: SPACE });
}

function join(fake: Fake, self: string, code: string) {
  return joinSpaceWithLink(fake.ctx, self, { code });
}

void test("someone removed can't rejoin with a link made before", async () => {
  const fake = space();
  // One that never expires, and one by the person who's then removed.
  const forever = await newLink(fake, OWNER);
  const theirOwn = await newLink(fake, MAYA, 60_000);
  await remove(fake, OWNER, MAYA);
  assert.equal(isMember(fake, MAYA), false);
  for (const code of [forever, theirOwn]) {
    await assert.rejects(join(fake, MAYA, code), /SPACE_INVITE_LINK_NOT_FOUND/);
    assert.equal(await spaceInviteLinkPreview(fake.ctx, MAYA, code), null);
  }
  assert.equal(isMember(fake, MAYA), false);
  // The links still work for everyone else.
  assert.notEqual(await spaceInviteLinkPreview(fake.ctx, LEO, forever), null);
});

void test("someone removed rejoins with a link made afterwards", async () => {
  const fake = space();
  const old = await newLink(fake, OWNER);
  await remove(fake, OWNER, MAYA);
  const fresh = await newLink(fake, LEO);
  assert.notEqual(await spaceInviteLinkPreview(fake.ctx, MAYA, fresh), null);
  assert.deepEqual(await join(fake, MAYA, fresh), { spaceId: SPACE });
  assert.equal(isMember(fake, MAYA), true);
  // Back in, the record is gone.
  assert.equal(fake.rows("spaceRemovals").length, 0);
  // Removed again, the link they came back with stops working too.
  await remove(fake, OWNER, MAYA);
  await assert.rejects(join(fake, MAYA, fresh), /SPACE_INVITE_LINK_NOT_FOUND/);
  await assert.rejects(join(fake, MAYA, old), /SPACE_INVITE_LINK_NOT_FOUND/);
  assert.equal(isMember(fake, MAYA), false);
});

void test("someone who left on their own rejoins with any link", async () => {
  const fake = space();
  const old = await newLink(fake, OWNER);
  await remove(fake, MAYA, MAYA);
  assert.equal(isMember(fake, MAYA), false);
  assert.equal(fake.rows("spaceRemovals").length, 0);
  assert.deepEqual(await join(fake, MAYA, old), { spaceId: SPACE });
  assert.equal(isMember(fake, MAYA), true);
});

void test("an owner adding someone back clears their removal", async () => {
  const fake = space();
  const old = await newLink(fake, OWNER);
  await remove(fake, OWNER, MAYA);
  await addSpaceMembers(fake.ctx, OWNER, { members: [MAYA], spaceId: SPACE });
  assert.equal(fake.rows("spaceRemovals").length, 0);
  // Leaving on their own after that, any link works again.
  await remove(fake, MAYA, MAYA);
  assert.deepEqual(await join(fake, MAYA, old), { spaceId: SPACE });
});

void test("removing someone else takes an owner", async () => {
  const fake = space();
  await assert.rejects(remove(fake, LEO, MAYA));
  assert.equal(isMember(fake, MAYA), true);
  assert.equal(fake.rows("spaceRemovals").length, 0);
});
