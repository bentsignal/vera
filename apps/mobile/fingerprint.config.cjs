// Native fingerprint: a hash of everything native, which changes whenever
// a binary would build differently. Dev clients are cached by it
// (scripts/sim.sh, scripts/phone.sh), and `pnpm release plan` uses it to
// say a store build has native changes waiting. Over-the-air updates match
// on the runtime version in app.config.ts instead (docs/releasing.md →
// Runtime versions). eas.json only affects native builds through env such
// as VERA_NOTIFICATION_EXTENSION, which already reaches the hashed app
// config, so it is left out.
/** @type {import('expo/fingerprint').Config} */
const config = {
  ignorePaths: ["eas.json"],
  // The default skip, plus the runtime version itself: raising it changes
  // which updates binaries take, not how they build.
  sourceSkips: [
    "PackageJsonAndroidAndIosScriptsIfNotContainRun",
    "ExpoConfigRuntimeVersionIfString",
  ],
  // The iOS notification service extension's Swift is copied in by a config
  // plugin, so the default sources miss it; without this, a change to it
  // would never call for a new build. (Sources can't be limited to iOS, so
  // it counts toward Android's fingerprint too.)
  extraSources: [
    {
      type: "dir",
      filePath: "plugins/notification-service",
      reasons: ["notificationServiceExtension"],
    },
    // pnpm's patches to dependencies are in the repo's root, not this
    // project's `patches`, which is all the default sources read. A patch
    // to native code (react-native's, for dictation) needs a new build.
    {
      type: "dir",
      filePath: "../../patches",
      reasons: ["pnpmPatches"],
    },
    // Reanimated compiles its static feature flags in from package.json's
    // "reanimated" key, which the default sources don't read.
    {
      type: "contents",
      id: "reanimatedStaticFeatureFlags",
      contents: JSON.stringify(require("./package.json").reanimated ?? null),
      reasons: ["reanimatedStaticFeatureFlags"],
    },
  ],
};
module.exports = config;
