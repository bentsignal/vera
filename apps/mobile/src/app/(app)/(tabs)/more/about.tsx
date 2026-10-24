import { Stack } from "expo-router";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { NativeListTesting } from "~/features/native-list/native-list-switch";
import { AboutSection } from "~/features/settings/about-section";

export default function AboutScreen() {
  return (
    <>
      <Stack.Screen options={{ headerLargeTitleEnabled: false }} />
      <Stack.Title>About</Stack.Title>
      <NativeHost style={{ flex: 1 }}>
        <FieldList>
          <AboutSection />
          <NativeListTesting />
        </FieldList>
      </NativeHost>
    </>
  );
}
