import assert from "node:assert/strict";
import test from "node:test";

import {
  androidNonce,
  judgeAndroidVerdict,
} from "./sign-up-devices-android.ts";
import {
  android,
  ANDROID_ID,
  androidToken,
  CONFIG,
  fakeGoogle,
  memoryStore,
  refusal,
  signUp,
} from "./sign-up-devices-testing.ts";
import { checkSignUpDevice, finishSignUpDevice } from "./sign-up-devices.ts";

void test("an Android phone gets one account, and a second is refused", async () => {
  const google = fakeGoogle();
  const { accounts, store } = memoryStore();
  assert.equal(
    await signUp(
      store,
      google.fetcher,
      android("first", await androidToken("first")),
    ),
    null,
  );
  // Google decodes a token once; the finish uses the start's claim.
  assert.equal(google.decodes(), 1);
  assert.deepEqual([...accounts.values()], [1]);
  assert.equal(
    await signUp(
      store,
      google.fetcher,
      android("second", await androidToken("second")),
    ),
    "DEVICE_LIMIT",
  );
});

void test("two sign-ups under way on one Android phone can't both get through", async () => {
  const google = fakeGoogle();
  const { store } = memoryStore();
  const first = android("first", await androidToken("first"));
  const second = android("second", await androidToken("second"));
  await checkSignUpDevice(store, CONFIG, first, google.fetcher);
  assert.equal(
    await refusal(() =>
      checkSignUpDevice(store, CONFIG, second, google.fetcher),
    ),
    "DEVICE_LIMIT",
  );
  // Starting the same sign-up again (after cancelling the passkey sheet)
  // is fine.
  const again = android("first", await androidToken("first"));
  assert.equal(
    await refusal(() =>
      checkSignUpDevice(store, CONFIG, again, google.fetcher),
    ),
    null,
  );
});

void test("an Android sign-up can't finish without a start that passed", async () => {
  const google = fakeGoogle();
  const { store } = memoryStore();
  const attempt = android("a", await androidToken("a"));
  assert.equal(
    await refusal(() =>
      finishSignUpDevice(store, CONFIG, attempt, google.fetcher),
    ),
    "DEVICE_PROOF_INVALID",
  );
});

void test("tokens that aren't Vera from Play on a real phone, for this sign-up, are refused", async () => {
  const now = Date.now();
  const expected = {
    nonce: await androidNonce(ANDROID_ID, "me"),
    now,
    packageName: "chat.vera.app",
  };
  async function judge(overrides: Parameters<typeof androidToken>[1]) {
    const verdict: unknown = JSON.parse(await androidToken("me", overrides));
    return refusal(() =>
      Promise.resolve(judgeAndroidVerdict(verdict, expected)),
    );
  }
  assert.equal(await judge({}), null);
  // A sideloaded or modified app.
  assert.equal(
    await judge({ app: "UNRECOGNIZED_VERSION" }),
    "DEVICE_PROOF_INVALID",
  );
  // An emulator, or a rooted phone.
  assert.equal(await judge({ device: [] }), "DEVICE_PROOF_INVALID");
  // Another app's token.
  assert.equal(
    await judge({ packageName: "com.example" }),
    "DEVICE_PROOF_INVALID",
  );
  // A token made for another username, or another Android ID.
  assert.equal(
    await judge({ nonceFor: "someone-else" }),
    "DEVICE_PROOF_INVALID",
  );
  // An old token, replayed.
  assert.equal(
    await judge({ at: now - 60 * 60 * 1000 }),
    "DEVICE_PROOF_INVALID",
  );
});

void test("a sign-up claiming another phone's Android ID, or a junk token, is refused", async () => {
  const google = fakeGoogle();
  const { store } = memoryStore();
  // The token was made on ANDROID_ID; the sign-up says it's another phone.
  const other = android("a", await androidToken("a"), "abcdef0123456789");
  assert.equal(
    await signUp(store, google.fetcher, other),
    "DEVICE_PROOF_INVALID",
  );
  assert.equal(
    await signUp(store, google.fetcher, android("a", "garbage")),
    "DEVICE_PROOF_INVALID",
  );
});
