import assert from "node:assert/strict";
import test from "node:test";

import type { MutationCtx } from "./_generated/server.js";
import { profileHandlers } from "./dispatcher.ts";

const ACCOUNT = "me@vera.chat";
const PHOTO = "https://media.vera.chat/prod/photo.jpg";
const identity = {
  accountId: ACCOUNT,
  issuer: "test",
  subject: ACCOUNT,
  tokenIdentifier: ACCOUNT,
};

interface Profile {
  accountId: string;
  avatarUrl: string | null;
  displayName: string;
}

function database(initial?: Profile) {
  let profile = initial === undefined ? null : { ...initial, _id: "profile" };
  const ctx = {
    db: {
      query: (table: string) => ({
        withIndex: (
          _index: string,
          build: (range: {
            eq: (field: string, value: string) => void;
          }) => unknown,
        ) => {
          let accountId = "";
          build({
            eq: (_field, value) => {
              accountId = value;
            },
          });
          return {
            unique: () =>
              Promise.resolve(
                table === "profiles" && profile?.accountId === accountId
                  ? profile
                  : null,
              ),
          };
        },
      }),
      insert: (_table: string, value: Profile) => {
        profile = { ...value, _id: "profile" };
        return Promise.resolve("profile");
      },
      patch: (_id: string, value: Partial<Profile>) => {
        assert.ok(profile);
        profile = { ...profile, ...value };
        return Promise.resolve();
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Only the database methods used by the real handlers are needed.
  return ctx as unknown as MutationCtx;
}

void test("a delayed initializer cannot reset an existing name or photo", async () => {
  const ctx = database({
    accountId: ACCOUNT,
    avatarUrl: PHOTO,
    displayName: "My name",
  });
  const profile = await profileHandlers.mutations.upsertMyProfile(ctx, {
    args: { avatarUrl: null, displayName: "me", createOnly: true },
    identity,
  });
  assert.equal(profile.avatarUrl, PHOTO);
  assert.equal(profile.displayName, "My name");
});

void test("interleaved name and photo edits only change the requested field", async () => {
  const ctx = database({
    accountId: ACCOUNT,
    avatarUrl: null,
    displayName: "Original",
  });
  function update(args: { avatarUrl?: string | null; displayName?: string }) {
    return profileHandlers.mutations.upsertMyProfile(ctx, { args, identity });
  }
  await update({ avatarUrl: PHOTO });
  const renamed = await update({ displayName: "Edited" });
  assert.equal(renamed.avatarUrl, PHOTO);
  assert.equal(renamed.displayName, "Edited");
  const removed = await update({ avatarUrl: null });
  assert.equal(removed.avatarUrl, null);
  assert.equal(removed.displayName, "Edited");
  const replaced = await update({ avatarUrl: PHOTO });
  assert.equal(replaced.displayName, "Edited");
});

void test("an unauthenticated read is never mistaken for a missing profile", async () => {
  const ctx = database({
    accountId: ACCOUNT,
    avatarUrl: PHOTO,
    displayName: "My name",
  });
  await assert.rejects(
    profileHandlers.queries.getMyProfile(ctx, { args: {}, identity: null }),
    /AUTHENTICATED_ACCOUNT_REQUIRED/,
  );
  const profile = await profileHandlers.queries.getMyProfile(ctx, {
    args: {},
    identity,
  });
  assert.equal(profile?.avatarUrl, PHOTO);
});

void test("first initialization creates once and old full-profile writes still work", async () => {
  const ctx = database();
  assert.equal(
    await profileHandlers.queries.getMyProfile(ctx, { args: {}, identity }),
    null,
  );
  const created = await profileHandlers.mutations.upsertMyProfile(ctx, {
    args: { createOnly: true, displayName: "me" },
    identity,
  });
  assert.equal(created.avatarUrl, null);
  assert.equal(created.displayName, "me");
  const legacy = await profileHandlers.mutations.upsertMyProfile(ctx, {
    args: { avatarUrl: PHOTO, displayName: "Old app" },
    identity,
  });
  assert.equal(legacy.avatarUrl, PHOTO);
  assert.equal(legacy.displayName, "Old app");
  const repeated = await profileHandlers.mutations.upsertMyProfile(ctx, {
    args: { createOnly: true, displayName: "me" },
    identity,
  });
  assert.deepEqual(repeated, legacy);
});

void test("invalid name edits and unauthenticated writes leave the photo alone", async () => {
  const ctx = database({
    accountId: ACCOUNT,
    avatarUrl: PHOTO,
    displayName: "My name",
  });
  await assert.rejects(
    profileHandlers.mutations.upsertMyProfile(ctx, {
      args: { displayName: " " },
      identity,
    }),
    /INVALID_DISPLAY_NAME/,
  );
  await assert.rejects(
    profileHandlers.mutations.upsertMyProfile(ctx, {
      args: { avatarUrl: null },
      identity: null,
    }),
    /AUTHENTICATED_ACCOUNT_REQUIRED/,
  );
  const profile = await profileHandlers.queries.getMyProfile(ctx, {
    args: {},
    identity,
  });
  assert.ok(profile);
  assert.equal(profile.avatarUrl, PHOTO);
  assert.equal(profile.displayName, "My name");
});
