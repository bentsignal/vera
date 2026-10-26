import * as Updates from "expo-updates";
import { FieldGroup, Row, Spacer, Text } from "@expo/ui";

import {
  appVersion,
  channel,
  runningUpdate,
} from "~/features/settings/app-info";
import { nativeColors } from "~/lib/colors";
import { fillRow } from "~/lib/ui-modifiers";

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
    <FieldGroup.Section>
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
