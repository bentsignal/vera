const { withMainApplication } = require("@expo/config-plugins");

const INSTALL = "chat.vera.networking.WebSocketPolicy.install()";
const START_REACT = /^([ \t]*)loadReactNative\(this\)/m;

function installBeforeReact(contents) {
  if (contents.includes(INSTALL)) return contents;
  if (!START_REACT.test(contents)) {
    throw new Error(
      "with-android-websocket-policy: MainApplication no longer has the expected loadReactNative(this) startup call.",
    );
  }
  return contents.replace(START_REACT, `$1${INSTALL}\n$1loadReactNative(this)`);
}

function withAndroidWebSocketPolicy(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== "kt") {
      throw new Error(
        "with-android-websocket-policy requires Kotlin MainApplication.",
      );
    }
    mod.modResults.contents = installBeforeReact(mod.modResults.contents);
    return mod;
  });
}

module.exports = withAndroidWebSocketPolicy;
module.exports.installBeforeReact = installBeforeReact;
