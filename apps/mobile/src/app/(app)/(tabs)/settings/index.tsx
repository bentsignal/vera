import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { TabTitle } from "~/components/tab-title";
import { AboutSection } from "~/features/settings/about-section";
import { AccountsSection } from "~/features/settings/accounts-section";
import { DisplaySection } from "~/features/settings/display-section";
import { ThemesSection } from "~/features/settings/themes-section";

export default function SettingsScreen() {
  return (
    <>
      <TabTitle title="Settings" />
      <NativeHost style={{ flex: 1 }}>
        <FieldList>
          <AccountsSection />
          <DisplaySection />
          <ThemesSection />
          <AboutSection />
        </FieldList>
      </NativeHost>
    </>
  );
}
