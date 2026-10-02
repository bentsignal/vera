import { FieldGroup } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { TabTitle } from "~/components/tab-title";
import { AccountsSection } from "~/features/settings/accounts-section";
import { DisplaySection } from "~/features/settings/display-section";

export default function SettingsScreen() {
  return (
    <>
      <TabTitle title="Settings" />
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <AccountsSection />
          <DisplaySection />
        </FieldGroup>
      </NativeHost>
    </>
  );
}
