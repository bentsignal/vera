const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} = require("@expo/config-plugins");

/**
 * Adds Icon Composer (`.icon`) documents as iOS alternate app icons, so each
 * one keeps its Liquid Glass, dark, and tinted appearances. Expo installs
 * the primary `.icon` from `ios.icon`; this does the same for the rest and
 * lists them in ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES, from which
 * Xcode writes `CFBundleAlternateIcons`. The app switches between them with
 * `expo-alternate-app-icons`, whose own plugin only handles PNG icons.
 *
 * Options: `{ icons: ["./assets/icons/vera-blue.icon", ...] }`. Each icon's
 * name is its file name without `.icon`.
 */
function iconName(iconPath) {
  return path.basename(iconPath, ".icon");
}

function withAlternateIconFiles(config, icons) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const { platformProjectRoot, projectName, projectRoot } =
        config.modRequest;
      for (const icon of icons) {
        await fs.promises.cp(
          path.join(projectRoot, icon),
          path.join(platformProjectRoot, projectName, `${iconName(icon)}.icon`),
          { recursive: true },
        );
      }
      return config;
    },
  ]);
}

function withAlternateIconProject(config, icons) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const { projectName } = config.modRequest;
    for (const icon of icons) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: `${projectName}/${iconName(icon)}.icon`,
        groupName: projectName,
        isBuildFile: true,
        project,
      });
    }
    const [, target] = IOSConfig.Target.findNativeTargetByName(
      project,
      projectName,
    );
    const configurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
      project,
      target.buildConfigurationList,
    );
    for (const [, configuration] of configurations) {
      if (configuration.buildSettings === undefined) continue;
      configuration.buildSettings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = `"${icons.map(iconName).join(" ")}"`;
      configuration.buildSettings.ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS =
        "YES";
    }
    return config;
  });
}

module.exports = function withAlternateIcons(config, { icons = [] } = {}) {
  return withAlternateIconProject(withAlternateIconFiles(config, icons), icons);
};
