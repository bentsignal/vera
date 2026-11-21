const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  buildEnvironmentProblems,
  checkBuildEnvironment,
} = require("./build-environment.cjs");

test("a store bundle without a PDS domain is refused", () => {
  assert.throws(() => checkBuildEnvironment({}), /EXPO_PUBLIC_VERA_DOMAIN/);
  assert.throws(
    () => checkBuildEnvironment({ EXPO_PUBLIC_VERA_DOMAIN: "" }),
    /EXPO_PUBLIC_VERA_DOMAIN/,
  );
});

test("a store bundle with the dev tools secret is refused", () => {
  assert.throws(
    () =>
      checkBuildEnvironment({
        EXPO_PUBLIC_DEV_TOOLS_SECRET: "secret",
        EXPO_PUBLIC_VERA_DOMAIN: "vera.chat",
      }),
    /EXPO_PUBLIC_DEV_TOOLS_SECRET/,
  );
  assert.equal(
    buildEnvironmentProblems({ EXPO_PUBLIC_DEV_TOOLS_SECRET: "secret" }).length,
    2,
  );
});

test("a store bundle that names its PDS builds", () => {
  assert.doesNotThrow(() =>
    checkBuildEnvironment({ EXPO_PUBLIC_VERA_DOMAIN: "vera.chat" }),
  );
});

test("Vera Dev bundles may fall back to the dev server and carry the secret", () => {
  assert.doesNotThrow(() =>
    checkBuildEnvironment({
      APP_VARIANT: "development",
      EXPO_PUBLIC_DEV_TOOLS_SECRET: "secret",
    }),
  );
});
