import { FieldGroup } from "@expo/ui";

import { HeaderFade } from "~/components/header-fade";
import { NativeHost } from "~/components/native-host";
import { TabTitle } from "~/components/tab-title";
import { AccountsSection } from "~/features/settings/accounts-section";
import { DisplaySection } from "~/features/settings/display-section";
import { ExperimentsSection } from "~/features/settings/experiments-section";
import { ThemesSection } from "~/features/settings/themes-section";

export default function SettingsScreen() {
  return (
    <>
      <TabTitle title="Settings" />
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <AccountsSection />
          <DisplaySection />
          <ThemesSection />
          <ExperimentsSection />
        </FieldGroup>
      </NativeHost>
      <HeaderFade background="--color-background-grouped" />
    </>
  );
}
