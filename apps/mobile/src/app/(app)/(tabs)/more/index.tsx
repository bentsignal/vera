import { useRouter } from "expo-router";
import { FieldGroup } from "@expo/ui";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { NavigationRow } from "~/components/navigation-row";
import { TabTitle } from "~/components/tab-title";
import { AccountsSection } from "~/features/settings/accounts-section";

/**
 * The More tab: your accounts, then settings, notifications, and about,
 * each on its own screen, with room for more (contacts) as the app grows.
 */
export default function MoreScreen() {
  const router = useRouter();
  return (
    <>
      <TabTitle title="More" />
      <NativeHost style={{ flex: 1 }}>
        <FieldList>
          <AccountsSection />
          <FieldGroup.Section>
            <NavigationRow
              icon={{ android: "settings", ios: "gearshape.fill" }}
              label="Settings"
              onPress={() => router.push("/more/settings")}
            />
            <NavigationRow
              icon={{ android: "notifications", ios: "bell.badge.fill" }}
              label="Notifications"
              onPress={() => router.push("/more/notifications")}
            />
          </FieldGroup.Section>
          <FieldGroup.Section>
            <NavigationRow
              icon={{ android: "info", ios: "info.circle.fill" }}
              label="About"
              onPress={() => router.push("/more/about")}
            />
          </FieldGroup.Section>
        </FieldList>
      </NativeHost>
    </>
  );
}
