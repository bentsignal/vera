import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIG,
  fakeApple,
  iphone,
  memoryStore,
  signUp,
} from "./sign-up-devices-testing.ts";
import { deviceCheckConfig, parseDeviceProof } from "./sign-up-devices.ts";

void test("production asks for a proof unless told not to; dev deployments don't", () => {
  assert.equal(deviceCheckConfig({}).required, true);
  assert.equal(deviceCheckConfig({ DEV_TOOLS: "true" }).required, false);
  assert.equal(
    deviceCheckConfig({ DEV_TOOLS: "true", SIGN_UP_DEVICE_CHECK: "required" })
      .required,
    true,
  );
  assert.equal(
    deviceCheckConfig({ SIGN_UP_DEVICE_CHECK: "off" }).required,
    false,
  );
  // A typo doesn't turn it off.
  assert.equal(
    deviceCheckConfig({ SIGN_UP_DEVICE_CHECK: "of" }).required,
    true,
  );
});

void test("one account per phone unless set higher, and never past three", () => {
  assert.equal(deviceCheckConfig({}).limit, 1);
  assert.equal(deviceCheckConfig({ SIGN_UPS_PER_DEVICE: "2" }).limit, 2);
  // Two bits at Apple count to three.
  assert.equal(deviceCheckConfig({ SIGN_UPS_PER_DEVICE: "9" }).limit, 3);
  assert.equal(deviceCheckConfig({ SIGN_UPS_PER_DEVICE: "0" }).limit, 1);
  assert.equal(deviceCheckConfig({ SIGN_UPS_PER_DEVICE: "x" }).limit, 1);
});

void test("malformed proofs count as none", () => {
  assert.equal(parseDeviceProof(null), null);
  assert.equal(parseDeviceProof({ platform: "ios" }), null);
  assert.equal(parseDeviceProof({ platform: "ios", token: "" }), null);
  assert.equal(parseDeviceProof({ platform: "windows", token: "x" }), null);
  assert.equal(parseDeviceProof({ platform: "android", token: "x" }), null);
  assert.equal(
    parseDeviceProof({
      androidId: "not hex!",
      platform: "android",
      token: "x",
    }),
    null,
  );
  assert.deepEqual(
    parseDeviceProof({ androidId: "ABC123", platform: "android", token: "x" }),
    { androidId: "abc123", platform: "android", token: "x" },
  );
});

void test("an iPhone gets one account, and a second is refused", async () => {
  const apple = fakeApple();
  const { store } = memoryStore();
  assert.equal(await signUp(store, apple.fetcher, iphone("first")), null);
  assert.deepEqual(apple.bits.get("phone-1"), { bit0: true, bit1: false });
  // Apple's bits outlast a reinstall, so a fresh token for the same phone
  // finds them too.
  assert.equal(
    await signUp(store, apple.fetcher, iphone("second")),
    "DEVICE_LIMIT",
  );
  assert.equal(
    await signUp(store, apple.fetcher, iphone("third", "phone-2")),
    null,
  );
});

void test("the limit can go up to three per iPhone", async () => {
  const apple = fakeApple();
  const { store } = memoryStore();
  const config = { ...CONFIG, limit: 3 };
  for (const name of ["a", "b", "c"]) {
    assert.equal(
      await signUp(store, apple.fetcher, iphone(name), config),
      null,
    );
  }
  assert.deepEqual(apple.bits.get("phone-1"), { bit0: true, bit1: true });
  assert.equal(
    await signUp(store, apple.fetcher, iphone("d"), config),
    "DEVICE_LIMIT",
  );
});

void test("a sign-up without a proof, or with a forged one, is refused", async () => {
  const apple = fakeApple();
  const { store } = memoryStore();
  assert.equal(
    await signUp(store, apple.fetcher, {
      address: "a@vera.chat",
      device: null,
      username: "a",
    }),
    "DEVICE_PROOF_REQUIRED",
  );
  assert.equal(
    await signUp(store, apple.fetcher, iphone("a", "made-up")),
    "DEVICE_PROOF_INVALID",
  );
});

void test("development-signed iPhones are checked at Apple's development host", async () => {
  const apple = fakeApple({ developmentOnly: ["phone-dev"] });
  const { store } = memoryStore();
  assert.equal(
    await signUp(store, apple.fetcher, iphone("a", "phone-dev")),
    null,
  );
  assert.equal(
    await signUp(store, apple.fetcher, iphone("b", "phone-dev")),
    "DEVICE_LIMIT",
  );
});

void test("when Apple is down or the PDS isn't set up, sign-ups wait instead of skipping the check", async () => {
  const { store } = memoryStore();
  assert.equal(
    await signUp(store, fakeApple({ down: true }).fetcher, iphone("a")),
    "DEVICE_CHECK_UNAVAILABLE",
  );
  assert.equal(
    await signUp(
      store,
      fakeApple().fetcher,
      iphone("a"),
      deviceCheckConfig({}),
    ),
    "DEVICE_CHECK_UNAVAILABLE",
  );
});

void test("switched off, nothing is asked", async () => {
  const { store } = memoryStore();
  const off = deviceCheckConfig({ DEV_TOOLS: "true" });
  const proofless = { address: "a@vera.chat", device: null, username: "a" };
  assert.equal(await signUp(store, fakeApple().fetcher, proofless, off), null);
});

void test("an operator's allowance lets one username past, once, uncounted", async () => {
  const apple = fakeApple();
  const { allowances, store } = memoryStore();
  assert.equal(await signUp(store, apple.fetcher, iphone("first")), null);
  allowances.add("tester@vera.chat");
  assert.equal(await signUp(store, apple.fetcher, iphone("tester")), null);
  assert.deepEqual(apple.bits.get("phone-1"), { bit0: true, bit1: false });
  assert.equal(
    await signUp(store, apple.fetcher, iphone("tester")),
    "DEVICE_LIMIT",
  );
});
