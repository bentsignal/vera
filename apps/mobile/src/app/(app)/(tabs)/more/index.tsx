import { useRouter } from "expo-router";
import PersonAdd from "@expo/material-symbols/person_add.xml";
import { FieldGroup } from "@expo/ui";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { NavigationRow } from "~/components/navigation-row";
import { PreloadIcons } from "~/components/preload-icons";
import { TabTitle } from "~/components/tab-title";
import { AccountsSection } from "~/features/settings/accounts-section";

/**
 * The More tab: your accounts, then contacts, settings, notifications,
 * and about, each on its own screen.
 */
export default function MoreScreen() {
  const router = useRouter();
  return (
    <>
      <TabTitle title="More" />
      {/* Contacts' Add Contact button, so its icon is ready when it opens. */}
      <PreloadIcons icons={{ personAdd: PersonAdd }} />
      <NativeHost style={{ flex: 1 }}>
        <FieldList>
          <AccountsSection />
          <FieldGroup.Section>
            <NavigationRow
              icon={{ android: "contacts", ios: "person.2.fill" }}
              label="Contacts"
              onPress={() => router.push("/more/contacts")}
            />
          </FieldGroup.Section>
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
