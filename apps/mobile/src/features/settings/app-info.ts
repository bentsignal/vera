import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Updates from "expo-updates";

// What this copy of the app is: shown in More → About, and sent to Vera
// Support with bug reports.

/** The marketing version and the native build number, such as "0.1.0 (6)". */
export function appVersion() {
  const version = Constants.expoConfig?.version ?? "";
  const build =
    Platform.OS === "ios"
      ? Constants.platform?.ios?.buildNumber
      : Constants.platform?.android?.versionCode;
  return build ? `${version} (${String(build)})` : version;
}

/** The binary's update channel. Local builds, like the dev client, have none. */
export function channel() {
  return Updates.channel === null || Updates.channel === ""
    ? "None"
    : Updates.channel;
}

/**
 * Which JavaScript the app launched with. The dev client loads it from Metro.
 * An emergency launch means a downloaded update failed and the app fell back
 * to the bundle in the binary.
 */
export function runningUpdate() {
  if (__DEV__) return "Development";
  if (!Updates.isEnabled) return "Built-in (updates off)";
  if (Updates.isEmergencyLaunch) return "Built-in (update failed)";
  if (Updates.isEmbeddedLaunch || Updates.updateId === null) return "Built-in";
  return Updates.updateId.slice(0, 8);
}

/** The device model and OS, such as "iPhone 17 Pro" and "iOS 26.1". */
export function deviceDetails() {
  return {
    device: Device.modelName ?? "Unknown device",
    os: `${Device.osName ?? Platform.OS} ${Device.osVersion ?? String(Platform.Version)}`,
  };
}
