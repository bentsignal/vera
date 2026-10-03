import { Stack, useLocalSearchParams } from "expo-router";
import { PROFILE_BIO_MAX_LENGTH } from "@decentralized-convex/accounts";
import { FieldGroup, Text, TextInput } from "@expo/ui";

import { showActionSheet } from "~/components/action-sheet";
import { NativeHost } from "~/components/native-host";
import { DeveloperSection } from "~/features/dev/developer-section";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { AccountSection } from "~/features/settings/account-section";
import { ProfileSection } from "~/features/settings/profile-section";
import { useProfileEditor } from "~/features/settings/use-profile-editor";
import { dismissKeyboardOnScroll } from "~/lib/ui-modifiers";

function AccountSettings() {
  const { address } = useAccount();
  const profile = useProfileEditor();
  const photoActions = [
    { label: "Take Photo", onPress: () => void profile.changePhoto("camera") },
    {
      label: "Choose from Library",
      onPress: () => void profile.changePhoto("library"),
    },
    ...(profile.avatarUrl === null
      ? []
      : [
          {
            destructive: true,
            label: "Remove Photo",
            onPress: () => void profile.removePhoto(),
          },
        ]),
  ];

  return (
    <>
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup modifiers={dismissKeyboardOnScroll}>
          <ProfileSection
            displayName={profile.displayName}
            address={address}
            avatarUrl={profile.avatarUrl}
            onChangePhoto={() => showActionSheet(photoActions)}
          />
          <FieldGroup.Section title="Display Name">
            <TextInput
              key={String(profile.isLoaded)}
              defaultValue={profile.savedName}
              placeholder="Your name"
              autoComplete="name"
              onChangeText={profile.changeName}
            />
            <FieldGroup.SectionFooter>
              <Text>Shown to people you message instead of your address.</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
          <FieldGroup.Section title="Bio">
            <TextInput
              key={String(profile.isLoaded)}
              defaultValue={profile.savedBio}
              placeholder="A few words about you"
              multiline
              maxLength={PROFILE_BIO_MAX_LENGTH}
              onChangeText={profile.changeBio}
            />
            <FieldGroup.SectionFooter>
              <Text>
                {`Shown on your profile under your name. Up to ${PROFILE_BIO_MAX_LENGTH} characters.`}
              </Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
          <DeveloperSection />
          <AccountSection />
        </FieldGroup>
      </NativeHost>
    </>
  );
}

/** One signed-in account's profile, tools, and sign-out. */
export default function AccountSettingsScreen() {
  const { account, title } = useLocalSearchParams<{
    account: string;
    title?: string;
  }>();
  return (
    <AccountScope address={account}>
      <Stack.Screen options={{ headerLargeTitleEnabled: false }} />
      <Stack.Title>{title ?? ""}</Stack.Title>
      <AccountSettings />
    </AccountScope>
  );
}
