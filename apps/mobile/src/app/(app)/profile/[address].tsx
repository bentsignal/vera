import { Alert, Platform } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { directConversationId } from "@decentralized-convex/messages";
import Edit from "@expo/material-symbols/edit.xml";
import { Button, FieldGroup, Text } from "@expo/ui";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { PreloadIcons } from "~/components/preload-icons";
import { LABEL_STYLE } from "~/components/prominent-button-style";
import {
  useContact,
  useContactActions,
  useMessagePermission,
} from "~/features/contacts/contacts";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useConversationActions } from "~/features/messaging/conversations";
import { useProfile } from "~/features/messaging/profiles";
import { ProfileCard } from "~/features/profile/profile-card";
import { secondaryTextStyle } from "~/lib/colors";
import {
  fillWidth,
  plainRow,
  prominentButton,
  secondaryButton,
} from "~/lib/ui-modifiers";

/** Opens (or starts) the direct conversation with `address`. */
function MessageButton({ address, name }: { address: string; name: string }) {
  const router = useRouter();
  const { address: account } = useAccount();
  const { openDirect } = useConversationActions();

  // Opens right away: the conversation's ID comes from the two addresses.
  function message() {
    void openDirect
      .mutateAsync({ accountId: address })
      .catch(() =>
        Alert.alert("Couldn't Open Conversation", "Try again in a moment."),
      );
    router.push({
      params: {
        account,
        conversationId: directConversationId(account, address.toLowerCase()),
        title: name,
      },
      pathname: "/conversation/[conversationId]",
    });
  }

  return (
    <Button
      variant="filled"
      modifiers={[...prominentButton, ...plainRow]}
      onPress={message}
    >
      <Text
        modifiers={fillWidth}
        textStyle={{ fontSize: 17, fontWeight: "600", textAlign: "center" }}
      >
        Message
      </Text>
    </Button>
  );
}

/** Adds them to your contacts, which the profile shows right away. */
function AddContactButton({ address }: { address: string }) {
  const { save } = useContactActions();
  return (
    <Button
      variant="outlined"
      modifiers={[...secondaryButton, ...plainRow]}
      onPress={() =>
        void save
          .mutateAsync({ accountId: address })
          .catch(() =>
            Alert.alert("Couldn't Add Contact", "Try again in a moment."),
          )
      }
    >
      <Text modifiers={fillWidth} textStyle={LABEL_STYLE}>
        Add to Contacts
      </Text>
    </Button>
  );
}

/** Edit, for a contact: your name and photo for them, or removing them. */
function EditToolbar({ address }: { address: string }) {
  const router = useRouter();
  const { address: account } = useAccount();
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        // Android's header shows only buttons with an icon.
        icon={Platform.OS === "ios" ? undefined : Edit}
        accessibilityLabel="Edit Contact"
        onPress={() =>
          router.push({
            params: { account, address },
            pathname: "/edit-contact",
          })
        }
      >
        Edit
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}

function Actions({
  address,
  name,
  isContact,
}: {
  address: string;
  name: string;
  isContact: boolean;
}) {
  const permission = useMessagePermission(address);
  // Each in its own section, so no row separator runs between them.
  return (
    <>
      <FieldGroup.Section>
        {permission?.direct === false ? (
          <Text
            modifiers={[...fillWidth, ...plainRow]}
            textStyle={{ ...secondaryTextStyle, textAlign: "center" }}
          >
            {`${name} only takes messages from their contacts.`}
          </Text>
        ) : (
          <MessageButton address={address} name={name} />
        )}
      </FieldGroup.Section>
      {!isContact && (
        <FieldGroup.Section>
          <AddContactButton address={address} />
        </FieldGroup.Section>
      )}
    </>
  );
}

function Profile({ address }: { address: string }) {
  const router = useRouter();
  const { address: account } = useAccount();
  const profile = useProfile(address);
  const permission = useMessagePermission(address);
  const contact = useContact(address);
  const isSelf = address === account;
  // Shown once the profile, whether they're a contact, and whether you
  // can message them have loaded, fading in rather than popping.
  if (
    profile.isLoading ||
    (!isSelf && (permission === undefined || contact === undefined))
  ) {
    return null;
  }
  return (
    <>
      {contact != null && <EditToolbar address={address} />}
      <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
        <NativeHost style={{ flex: 1 }}>
          <FieldList>
            <ProfileCard
              name={profile.displayName}
              aka={
                profile.displayName === profile.ownName
                  ? undefined
                  : profile.ownName
              }
              subtitle={address}
              avatarUrl={profile.avatarUrl}
              onPressAffiliated={
                profile.affiliated
                  ? () =>
                      router.push({
                        params: { account, address },
                        pathname: "/affiliated",
                      })
                  : undefined
              }
            />
            {!isSelf && (
              <Actions
                address={address}
                name={profile.displayName}
                isContact={contact != null}
              />
            )}
          </FieldList>
        </NativeHost>
      </Animated.View>
    </>
  );
}

/** A person's profile, seen as the account in the `account` param. */
export default function ProfileScreen() {
  const { account, address } = useLocalSearchParams<{
    /** The signed-in account looking at the profile. */
    account?: string;
    address: string;
  }>();
  return (
    <AccountScope address={account}>
      {/* Edit's icon, ready before the profile loads and shows it. */}
      <PreloadIcons icons={{ edit: Edit }} />
      <Profile address={address} />
    </AccountScope>
  );
}
