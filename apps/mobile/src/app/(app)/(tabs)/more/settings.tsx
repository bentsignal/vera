import { Stack } from "expo-router";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import {
  DisplaySection,
  ExperimentalSection,
} from "~/features/settings/display-section";
import {
  AppIconSection,
  ThemesSection,
} from "~/features/settings/themes-section";

/** How the app looks on this device: appearance, message style, colors. */
export default function SettingsScreen() {
  return (
    <>
      <Stack.Screen options={{ headerLargeTitleEnabled: false }} />
      <Stack.Title>Settings</Stack.Title>
      <NativeHost style={{ flex: 1 }}>
        <FieldList>
          <DisplaySection />
          <ThemesSection />
          <AppIconSection />
          <ExperimentalSection />
        </FieldList>
      </NativeHost>
    </>
  );
}
