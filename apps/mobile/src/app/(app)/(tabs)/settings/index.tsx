import { useState } from "react";
import { Alert } from "react-native";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import {
  Button,
  FieldGroup,
  Row,
  Spacer,
  Switch,
  Text,
  TextInput,
} from "@expo/ui";

import { ActionSheet } from "~/components/action-sheet";
import { NativeHost } from "~/components/native-host";
import { env } from "~/env";
import { AppearancePicker } from "~/features/settings/appearance-picker";
import { ProfileSection } from "~/features/settings/profile-section";
import { nativeColors } from "~/lib/colors";
import { destructive } from "~/lib/ui-modifiers";
import { me } from "~/mock/people";
import { signOut } from "~/mock/session";

// Avatar upload arrives with file storage.
const AVATAR_ACTIONS = [
  { label: "Take Photo" },
  { label: "Choose from Library" },
  { label: "Remove Photo" },
];

function confirmSignOut() {
  Alert.alert("Sign Out?", "You can sign back in with your passkey.", [
    { text: "Cancel", style: "cancel" },
    { text: "Sign Out", style: "destructive", onPress: signOut },
  ]);
}

export default function SettingsScreen() {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [previews, setPreviews] = useState(true);

  return (
    <>
      <Stack.Title>Settings</Stack.Title>
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <ProfileSection
            displayName={displayName.trim() || me.displayName}
            address={me.address}
            onChangePhoto={() => setAvatarSheetOpen(true)}
          />
          <FieldGroup.Section title="Display Name">
            <TextInput
              defaultValue={me.displayName}
              placeholder="Your name"
              autoComplete="name"
              onChangeText={setDisplayName}
            />
            <FieldGroup.SectionFooter>
              <Text>Shown to people you message instead of your address.</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
          <FieldGroup.Section title="Notifications">
            <Switch
              label="Messages"
              value={notifications}
              onValueChange={setNotifications}
            />
            <Switch
              label="Show Previews"
              value={previews}
              onValueChange={setPreviews}
            />
          </FieldGroup.Section>
          <FieldGroup.Section title="Display">
            <AppearancePicker />
          </FieldGroup.Section>
          <FieldGroup.Section title="Account">
            <Row alignment="center">
              <Text>Home Server</Text>
              <Spacer />
              <Text textStyle={{ color: nativeColors.secondaryLabel }}>
                {env.veraDomain}
              </Text>
            </Row>
            <Button
              label="Sign Out"
              variant="text"
              modifiers={destructive}
              onPress={confirmSignOut}
            />
            <FieldGroup.SectionFooter>
              <Text>{`Vera ${Constants.expoConfig?.version ?? ""}`}</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
        </FieldGroup>
      </NativeHost>
      <ActionSheet
        isPresented={avatarSheetOpen}
        onDismiss={() => setAvatarSheetOpen(false)}
        actions={AVATAR_ACTIONS}
      />
    </>
  );
}
