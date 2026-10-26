const assert = require("node:assert/strict");
const { test } = require("node:test");
const { installBeforeReact } = require("./with-android-websocket-policy.cjs");

test("installs the transport policy before React and Expo start, only once", () => {
  const source = `override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }`;
  const result = installBeforeReact(source);
  assert.ok(
    result.indexOf("WebSocketPolicy.install()") <
      result.indexOf("loadReactNative(this)"),
  );
  assert.ok(
    result.indexOf("WebSocketPolicy.install()") <
      result.indexOf("ApplicationLifecycleDispatcher"),
  );
  assert.equal(installBeforeReact(result), result);
});

test("fails visibly if an SDK template change removes the startup anchor", () => {
  assert.throws(
    () => installBeforeReact("class MainApplication {}"),
    /startup call/,
  );
});
