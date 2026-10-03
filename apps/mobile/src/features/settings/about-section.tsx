import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { FieldGroup, Row, Spacer, Text } from "@expo/ui";

import { nativeColors } from "~/lib/colors";
import { fillRow } from "~/lib/ui-modifiers";

/** The marketing version and the native build number, such as "0.1.0 (6)". */
function appVersion() {
  const version = Constants.expoConfig?.version ?? "";
  const build =
    Platform.OS === "ios"
      ? Constants.platform?.ios?.buildNumber
      : Constants.platform?.android?.versionCode;
  return build ? `${version} (${String(build)})` : version;
}

/** The binary's update channel. Local builds, like the dev client, have none. */
function channel() {
  return Updates.channel === null || Updates.channel === ""
    ? "None"
    : Updates.channel;
}

/**
 * Which JavaScript the app launched with. The dev client loads it from Metro.
 * An emergency launch means a downloaded update failed and the app fell back
 * to the bundle in the binary.
 */
function runningUpdate() {
  if (__DEV__) return "Development";
  if (!Updates.isEnabled) return "Built-in (updates off)";
  if (Updates.isEmergencyLaunch) return "Built-in (update failed)";
  if (Updates.isEmbeddedLaunch || Updates.updateId === null) return "Built-in";
  return Updates.updateId.slice(0, 8);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Row alignment="center" modifiers={fillRow}>
      <Text>{label}</Text>
      <Spacer flexible />
      <Text textStyle={{ color: nativeColors.secondaryLabel }}>{value}</Text>
    </Row>
  );
}

/** The build and over-the-air update this copy of the app is running. */
export function AboutSection() {
  const published =
    !__DEV__ && Updates.updateId !== null && !Updates.isEmbeddedLaunch
      ? Updates.createdAt
      : null;
  return (
    <FieldGroup.Section title="About">
      <Detail label="Version" value={appVersion()} />
      <Detail label="Channel" value={channel()} />
      <Detail label="Update" value={runningUpdate()} />
      {published && (
        <Detail
          label="Published"
          value={published.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        />
      )}
    </FieldGroup.Section>
  );
}
