import type { Conversation } from "@decentralized-convex/messages";
import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FieldGroup } from "@expo/ui";

import type { AvatarGlyph } from "~/components/avatar";
import { NativeHost } from "~/components/native-host";
import {
  LeaveSection,
  MembersSection,
  MuteSection,
} from "~/features/conversation-info/sections";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useConversation } from "~/features/messaging/conversations";
import { useSpace } from "~/features/messaging/spaces";
import { ProfileCard } from "~/features/profile/profile-card";

const CHANNEL_GLYPH = { android: "tag", ios: "number" } as const;

interface CardProps {
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  glyph?: AvatarGlyph;
  onPressAffiliated?: () => void;
}

/** The card, then members, alerts, and leaving, as the kind allows. */
function Details({
  conversation,
  card,
}: {
  conversation: Conversation;
  card: CardProps;
}) {
  const { conversationId, kind, members, muted } = conversation;
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <ProfileCard {...card} />
          {kind !== "direct" && <MembersSection members={members} />}
          <MuteSection conversationId={conversationId} muted={muted} />
          {kind === "group" && (
            <LeaveSection conversationId={conversationId} name={card.name} />
          )}
        </FieldGroup>
      </NativeHost>
    </Animated.View>
  );
}

/** A channel, named with its space once that loads. */
function ChannelDetails({
  conversation,
  title,
}: {
  conversation: Conversation;
  title: string;
}) {
  const { isLoading, space } = useSpace(conversation.spaceId ?? "");
  if (isLoading) return null;
  return (
    <Details
      conversation={conversation}
      card={{
        glyph: CHANNEL_GLYPH,
        name: title,
        subtitle: space === undefined ? "Channel" : `Channel in ${space.name}`,
      }}
    />
  );
}

function Info({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { address } = useAccount();
  const { conversation, isLoading, profileOf, title } =
    useConversation(conversationId);
  // Everything fades in together once loaded.
  if (isLoading) return null;
  if (conversation === undefined) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-body text-muted">
          This conversation doesn't exist.
        </Text>
      </View>
    );
  }
  if (conversation.kind === "channel") {
    return <ChannelDetails conversation={conversation} title={title} />;
  }
  if (conversation.kind === "group") {
    return (
      <Details
        conversation={conversation}
        card={{ name: title, subtitle: "Group" }}
      />
    );
  }
  const other =
    conversation.members.find((member) => member !== address) ?? address;
  const profile = profileOf(other);
  return (
    <Details
      conversation={conversation}
      card={{
        avatarUrl: profile.avatarUrl,
        name: title,
        onPressAffiliated: profile.affiliated
          ? () =>
              router.push({
                params: { account: address, address: other },
                pathname: "/affiliated",
              })
          : undefined,
        subtitle: other,
      }}
    />
  );
}

/** Details for a conversation: who is in it, alerts, and leaving. */
export default function ConversationInfoScreen() {
  const { account, conversationId } = useLocalSearchParams<{
    /** The signed-in account the conversation is opened as. */
    account?: string;
    conversationId: string;
  }>();
  return (
    <AccountScope address={account}>
      <Info conversationId={conversationId} />
    </AccountScope>
  );
}
