const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} = require("@expo/config-plugins");

/**
 * Adds Vera's App Shortcuts (`app-intents/VeraIntents.swift`) to the app
 * target, where Xcode finds App Intents and lists them in the Shortcuts
 * app, Siri, Spotlight, and the Action button. They hand off to
 * JavaScript through `modules/shortcuts`.
 */

const SOURCE = "VeraIntents.swift";

function withIntentsFile(config) {
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const { projectRoot, platformProjectRoot } = mod.modRequest;
      const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      fs.copyFileSync(
        path.join(__dirname, "app-intents", SOURCE),
        path.join(platformProjectRoot, projectName, SOURCE),
      );
      return mod;
    },
  ]);
}

function withIntentsSource(config) {
  return withXcodeProject(config, (mod) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(
      mod.modRequest.projectRoot,
    );
    // Skips the file when it is already in the group.
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${projectName}/${SOURCE}`,
      groupName: projectName,
      // The `xcode` package that types this project object ships no types.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      project: mod.modResults,
    });
    return mod;
  });
}

function withAppIntents(config) {
  return withIntentsSource(withIntentsFile(config));
}

module.exports = withAppIntents;
