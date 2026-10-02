import { useState } from "react";
import { Stack } from "expo-router";
import { FieldGroup, Text, TextInput } from "@expo/ui";

import { ActionSheet } from "~/components/action-sheet";
import { NativeHost } from "~/components/native-host";
import { DeveloperSection } from "~/features/dev/developer-section";
import { useAccount } from "~/features/messaging/account";
import { AccountSection } from "~/features/settings/account-section";
import { AppearancePicker } from "~/features/settings/appearance-picker";
import { ProfileSection } from "~/features/settings/profile-section";
import { useProfileEditor } from "~/features/settings/use-profile-editor";

export default function SettingsScreen() {
  const { address } = useAccount();
  const profile = useProfileEditor();
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const photoActions = [
    { label: "Take Photo", onPress: () => void profile.changePhoto("camera") },
    {
      label: "Choose from Library",
      onPress: () => void profile.changePhoto("library"),
    },
    ...(profile.avatarUrl === null
      ? []
      : [{ label: "Remove Photo", onPress: () => void profile.removePhoto() }]),
  ];

  return (
    <>
      <Stack.Title>Settings</Stack.Title>
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <ProfileSection
            displayName={profile.displayName}
            address={address}
            avatarUrl={profile.avatarUrl}
            onChangePhoto={() => setAvatarSheetOpen(true)}
          />
          <FieldGroup.Section title="Display Name">
            <TextInput
              defaultValue={profile.savedName}
              placeholder="Your name"
              autoComplete="name"
              onChangeText={profile.changeName}
            />
            <FieldGroup.SectionFooter>
              <Text>Shown to people you message instead of your address.</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
          <FieldGroup.Section title="Display">
            <AppearancePicker />
          </FieldGroup.Section>
          <DeveloperSection />
          <AccountSection />
        </FieldGroup>
      </NativeHost>
      <ActionSheet
        isPresented={avatarSheetOpen}
        onDismiss={() => setAvatarSheetOpen(false)}
        actions={photoActions}
      />
    </>
  );
}
