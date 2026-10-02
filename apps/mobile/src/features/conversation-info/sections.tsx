import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { Button, FieldGroup, ListItem, Switch, Text } from "@expo/ui";
import { pds } from "@vera/backend/pds";

import { Avatar } from "~/components/avatar";
import { useAccount } from "~/features/messaging/account";
import { useProfiles } from "~/features/messaging/profiles";
import { useOpenProfile } from "~/features/profile/use-open-profile";
import { secondaryTextStyle } from "~/lib/colors";
import { destructive } from "~/lib/ui-modifiers";

/** Everyone in a group or channel; tapping someone opens their profile. */
export function MembersSection({ members }: { members: readonly string[] }) {
  const { address: self } = useAccount();
  const profileOf = useProfiles(members);
  const openProfile = useOpenProfile();
  return (
    <FieldGroup.Section title={`${members.length} Members`}>
      {members.map((member) => {
        const profile = profileOf(member);
        return (
          <ListItem
            key={member}
            leading={
              <Avatar
                name={profile.displayName}
                size="row"
                uri={profile.avatarUrl}
              />
            }
            supportingText={
              <Text textStyle={secondaryTextStyle}>
                {member === self ? `${member} · You` : member}
              </Text>
            }
            onPress={() => openProfile(member)}
          >
            {profile.displayName}
          </ListItem>
        );
      })}
    </FieldGroup.Section>
  );
}

/** iMessage's "Hide Alerts": mutes notifications for this conversation. */
export function MuteSection({
  conversationId,
  muted,
}: {
  conversationId: string;
  muted: boolean;
}) {
  const { address } = useAccount();
  // Shows the choice right away; the server's answer replaces it.
  const [choice, setChoice] = useState<boolean | null>(null);
  const setMuted = useMutation(
    pdsMutation({ mutation: pds.messages.setMuted, session: address }),
  );
  return (
    <FieldGroup.Section>
      <Switch
        label="Hide Alerts"
        value={choice ?? muted}
        onValueChange={(value) => {
          setChoice(value);
          setMuted.mutate(
            { conversationId, muted: value },
            { onError: () => setChoice(null) },
          );
        }}
      />
    </FieldGroup.Section>
  );
}

export function LeaveSection({
  conversationId,
  name,
}: {
  conversationId: string;
  name: string;
}) {
  const router = useRouter();
  const { address } = useAccount();
  const leave = useMutation(
    pdsMutation({ mutation: pds.messages.leaveConversation, session: address }),
  );

  function confirm() {
    Alert.alert(`Leave ${name}?`, "You won't get new messages from it.", [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          leave.mutate({ conversationId });
          // The conversation is gone for you, so go back to Chats.
          router.dismissAll();
        },
        style: "destructive",
        text: "Leave",
      },
    ]);
  }

  return (
    <FieldGroup.Section>
      <Button
        label="Leave this Conversation"
        variant="text"
        modifiers={destructive}
        onPress={confirm}
      />
    </FieldGroup.Section>
  );
}
