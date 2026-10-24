const fs = require("node:fs");
const path = require("node:path");
const { withPodfileProperties } = require("@expo/config-plugins");

/**
 * Builds React Native itself from source on iOS, rather than linking its
 * prebuilt core, so the repo's patch to it compiles into the app:
 * patches/react-native@0.86.3.patch makes Fabric's text input leave a
 * dictation alone while its spinner is in the field, as the old
 * architecture does on iOS 16 and later (facebook/react-native#37188). The
 * prebuilt core (`React.xcframework`) is compiled before the patch is
 * applied, so with it the patch would change nothing. Delete this, and the
 * patch, once React Native ships the fix.
 *
 * The generated Podfile reads `ios.buildReactNativeFromSource`, which
 * turns off `RCT_USE_PREBUILT_RNCORE` and `RCT_USE_RN_DEP` (the same
 * setting expo-build-properties writes).
 */

/** In the patched file: what the patch adds. */
const PATCH_MARKER = "[vera: dictation-recognizing]";
const PATCHED_FILE =
  "React/Fabric/Mounting/ComponentViews/TextInput/RCTTextInputComponentView.mm";

/** The installed react-native's patched file, from the app's directory. */
function patchedFile(projectRoot) {
  const pkg = require.resolve("react-native/package.json", {
    paths: [projectRoot],
  });
  return path.join(path.dirname(pkg), PATCHED_FILE);
}

/**
 * Fails the build if the installed react-native isn't patched (an install
 * that skipped it, a React Native upgrade the patch no longer fits), so a
 * build never ships without the fix while seeming to have it.
 */
function requirePatched(projectRoot) {
  const file = patchedFile(projectRoot);
  if (!fs.readFileSync(file, "utf8").includes(PATCH_MARKER)) {
    throw new Error(
      `with-react-native-from-source: ${file} doesn't have the dictation patch (patches/react-native@*.patch). Run pnpm install, or update the patch for this React Native.`,
    );
  }
}

/** Sets the Podfile's switch to build React Native from source. */
function fromSource(properties) {
  return { ...properties, "ios.buildReactNativeFromSource": "true" };
}

function withReactNativeFromSource(config) {
  return withPodfileProperties(config, (podfile) => {
    requirePatched(podfile.modRequest.projectRoot);
    podfile.modResults = fromSource(podfile.modResults);
    return podfile;
  });
}

module.exports = withReactNativeFromSource;
module.exports.fromSource = fromSource;
module.exports.patchedFile = patchedFile;
module.exports.requirePatched = requirePatched;
module.exports.PATCH_MARKER = PATCH_MARKER;
