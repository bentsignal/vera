const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");

/**
 * Apps built with the iOS 27 SDK must adopt the UIScene life cycle or they
 * crash at launch. Expo SDK 57 ships `ExpoAppSceneDelegate`, but its project
 * template does not use it yet. This plugin applies the SDK 58 template
 * changes; delete it after upgrading to SDK 58.
 */

const SCENE_DELEGATE_FILE = "SceneDelegate.swift";

const SCENE_DELEGATE_SOURCE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const WINDOW_SETUP =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s+factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function adoptSceneDelegate(contents) {
  if (contents.includes("ExpoReactNativeFactoryProvider")) return contents;
  if (!WINDOW_SETUP.test(contents)) {
    throw new Error(
      "with-ios-scene-lifecycle: AppDelegate.swift no longer matches the SDK 57 template.",
    );
  }
  return contents
    .replace(
      "class AppDelegate: ExpoAppDelegate {",
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
    )
    .replace(
      WINDOW_SETUP,
      "\n    // SceneDelegate creates the window and starts React Native.\n",
    );
}

function withSceneManifest(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return mod;
  });
}

function withSceneDelegateFile(config) {
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const { projectRoot, platformProjectRoot } = mod.modRequest;
      const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      fs.writeFileSync(
        path.join(platformProjectRoot, projectName, SCENE_DELEGATE_FILE),
        SCENE_DELEGATE_SOURCE,
      );
      return mod;
    },
  ]);
}

function withSceneDelegateSource(config) {
  return withXcodeProject(config, (mod) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(
      mod.modRequest.projectRoot,
    );
    // Skips the file when it is already in the group.
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${projectName}/${SCENE_DELEGATE_FILE}`,
      groupName: projectName,
      // The `xcode` package that types this project object ships no types.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      project: mod.modResults,
    });
    return mod;
  });
}

function withAppDelegateProvider(config) {
  return withAppDelegate(config, (mod) => {
    mod.modResults.contents = adoptSceneDelegate(mod.modResults.contents);
    return mod;
  });
}

function withIosSceneLifecycle(config) {
  return withAppDelegateProvider(
    withSceneDelegateSource(withSceneDelegateFile(withSceneManifest(config))),
  );
}

module.exports = withIosSceneLifecycle;
