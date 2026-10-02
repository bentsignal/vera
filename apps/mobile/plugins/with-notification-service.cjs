const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");

/**
 * Adds the `NotificationService` Notification Service Extension, which turns
 * message pushes into iOS communication notifications (the sender's photo as
 * the icon, the sender as the title). It:
 *
 * - copies `notification-service/NotificationService.swift` and writes the
 *   extension's Info.plist into `ios/NotificationService`;
 * - adds the app extension target, embedded in the app;
 * - gives the app the Communication Notifications entitlement and lists
 *   `INSendMessageIntent` in `NSUserActivityTypes`.
 *
 * EAS signs the extension from `extra.eas.build.experimental.ios.appExtensions`
 * in app.config.ts. See apps/mobile/README.md for the one-time credentials
 * setup.
 */

const TARGET = "NotificationService";
const SOURCE = "NotificationService.swift";
const INFO_PLIST = "Info.plist";
const COMMUNICATION_ENTITLEMENT =
  "com.apple.developer.usernotifications.communication";

function extensionInfoPlist({ buildNumber, version }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>${TARGET}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${buildNumber}</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionAttributes</key>
    <dict>
      <key>IntentsSupported</key>
      <array>
        <string>INSendMessageIntent</string>
      </array>
    </dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).NotificationService</string>
  </dict>
</dict>
</plist>
`;
}

function withExtensionFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (mod) => {
      const directory = path.join(mod.modRequest.platformProjectRoot, TARGET);
      await fs.promises.mkdir(directory, { recursive: true });
      await fs.promises.copyFile(
        path.join(__dirname, "notification-service", SOURCE),
        path.join(directory, SOURCE),
      );
      await fs.promises.writeFile(
        path.join(directory, INFO_PLIST),
        extensionInfoPlist({
          // Matches the app; EAS updates both when it sets the build number.
          buildNumber: mod.ios?.buildNumber ?? "1",
          version: mod.version ?? "1.0.0",
        }),
      );
      return mod;
    },
  ]);
}

/** Build settings shared by the extension's Debug and Release configurations. */
function extensionBuildSettings(appSettings, bundleIdentifier) {
  return {
    CLANG_ENABLE_MODULES: "YES",
    CODE_SIGN_STYLE: "Automatic",
    ...(appSettings.DEVELOPMENT_TEAM === undefined
      ? {}
      : { DEVELOPMENT_TEAM: appSettings.DEVELOPMENT_TEAM }),
    INFOPLIST_FILE: `${TARGET}/${INFO_PLIST}`,
    IPHONEOS_DEPLOYMENT_TARGET:
      appSettings.IPHONEOS_DEPLOYMENT_TARGET ?? "16.4",
    PRODUCT_BUNDLE_IDENTIFIER: `"${bundleIdentifier}"`,
    PRODUCT_NAME: `"$(TARGET_NAME)"`,
    SKIP_INSTALL: "YES",
    SWIFT_VERSION: "5.0",
    TARGETED_DEVICE_FAMILY: `"1,2"`,
  };
}

/**
 * `addPbxGroup` gives every file a build file; the Info.plist is only
 * referenced by INFOPLIST_FILE and must not be one.
 */
function removeBuildFile(project, group, fileName) {
  const child = group.children.find(({ comment }) => comment === fileName);
  if (child === undefined) return;
  const buildFiles = project.pbxBuildFileSection();
  for (const key of Object.keys(buildFiles)) {
    if (buildFiles[key]?.fileRef === child.value) {
      delete buildFiles[key];
      delete buildFiles[`${key}_comment`];
    }
  }
}

function addExtensionTarget(project, projectName, bundleIdentifier) {
  // `addTarget` assumes these sections exist; fresh Expo projects have none.
  const objects = project.hash.project.objects;
  objects.PBXTargetDependency ??= {};
  objects.PBXContainerItemProxy ??= {};

  const group = project.addPbxGroup([SOURCE, INFO_PLIST], TARGET, TARGET);
  removeBuildFile(project, group.pbxGroup, INFO_PLIST);
  project.addToPbxGroup(
    group.uuid,
    project.getFirstProject().firstProject.mainGroup,
  );

  // Also embeds the product in the app's PlugIns folder.
  const target = project.addTarget(
    TARGET,
    "app_extension",
    TARGET,
    bundleIdentifier,
  );
  project.addBuildPhase(
    [SOURCE],
    "PBXSourcesBuildPhase",
    "Sources",
    target.uuid,
  );
  project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid);
  project.addBuildPhase(
    [],
    "PBXFrameworksBuildPhase",
    "Frameworks",
    target.uuid,
  );

  const [, appTarget] = IOSConfig.Target.findNativeTargetByName(
    project,
    projectName,
  );
  const [, appConfiguration] =
    IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
      project,
      appTarget.buildConfigurationList,
    )[0];
  const settings = extensionBuildSettings(
    appConfiguration.buildSettings,
    bundleIdentifier,
  );
  for (const [
    ,
    configuration,
  ] of IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
    project,
    target.pbxNativeTarget.buildConfigurationList,
  )) {
    Object.assign(configuration.buildSettings, settings);
  }
}

function withExtensionTarget(config, bundleIdentifier) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    // A target added in this run is still named with quotes.
    const exists =
      project.pbxTargetByName(TARGET) !== null ||
      project.pbxTargetByName(`"${TARGET}"`) !== null;
    if (!exists) {
      addExtensionTarget(project, mod.modRequest.projectName, bundleIdentifier);
    }
    return mod;
  });
}

function withCommunicationNotifications(config) {
  const withEntitlement = withEntitlementsPlist(config, (mod) => {
    mod.modResults[COMMUNICATION_ENTITLEMENT] = true;
    return mod;
  });
  return withInfoPlist(withEntitlement, (mod) => {
    const types = mod.modResults.NSUserActivityTypes ?? [];
    if (!types.includes("INSendMessageIntent")) {
      mod.modResults.NSUserActivityTypes = [...types, "INSendMessageIntent"];
    }
    return mod;
  });
}

/**
 * Options: `{ bundleIdentifier, enabled }`. `bundleIdentifier` is the
 * extension's; when `enabled` is false the plugin changes nothing.
 */
module.exports = function withNotificationService(
  config,
  { bundleIdentifier, enabled = true } = {},
) {
  if (!enabled) return config;
  if (bundleIdentifier === undefined) {
    throw new Error("with-notification-service: bundleIdentifier is required.");
  }
  return withCommunicationNotifications(
    withExtensionTarget(withExtensionFiles(config), bundleIdentifier),
  );
};
