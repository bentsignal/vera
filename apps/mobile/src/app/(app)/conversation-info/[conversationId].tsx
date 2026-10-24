import type { Conversation } from "@decentralized-convex/messages";
import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";

import type { AvatarGlyph } from "~/components/avatar";
import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import {
  InboxSection,
  LeaveSection,
  MembersSection,
} from "~/features/conversation-info/sections";
import { ThreadsSection } from "~/features/conversation-info/thread-items";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useConversation } from "~/features/messaging/conversations";
import { useProfileState } from "~/features/messaging/profiles";
import { useSpace } from "~/features/messaging/spaces";
import {
  threadPeople,
  useConversationThreads,
} from "~/features/messaging/thread-lists";
import { ConversationListSection } from "~/features/native-list/native-list-switch";
import { ProfileCard } from "~/features/profile/profile-card";

const CHANNEL_GLYPH = { android: "tag", ios: "number" } as const;

interface CardProps {
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  glyph?: AvatarGlyph;
  onPressAffiliated?: () => void;
}

/** How many threads the info page lists before See All. */
const RECENT_THREADS = 3;

/**
 * The conversation's three newest threads with their people's names, for
 * its Threads section. Undefined until both have loaded.
 */
function useRecentThreads(conversationId: string) {
  const { isLoading, threads } = useConversationThreads({
    conversationId,
    limit: RECENT_THREADS,
    mine: false,
  });
  const recent = threads.slice(0, RECENT_THREADS);
  const profiles = useProfileState(threadPeople(recent));
  if (isLoading || profiles.isLoading) return undefined;
  return { profileOf: profiles.profileOf, threads: recent };
}

type RecentThreads = NonNullable<ReturnType<typeof useRecentThreads>>;

/**
 * The card, then inbox and alerts, threads, members, and leaving, as
 * allowed.
 */
function Details({
  conversation,
  card,
  recent,
}: {
  conversation: Conversation;
  card: CardProps;
  recent: RecentThreads;
}) {
  const router = useRouter();
  const { address: account } = useAccount();
  const { conversationId, kind, members } = conversation;
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
      <NativeHost style={{ flex: 1 }}>
        <FieldList clearsNavigationBar>
          <ProfileCard {...card} />
          <InboxSection conversation={conversation} />
          <ConversationListSection />
          <ThreadsSection
            conversationId={conversationId}
            title={card.name}
            threads={recent.threads}
            profileOf={recent.profileOf}
          />
          {kind !== "direct" && (
            <MembersSection
              members={members}
              // Anyone in a group can add people; a channel's members are
              // its space's.
              onAdd={
                kind === "group"
                  ? () =>
                      router.push({
                        params: { account, conversationId },
                        pathname: "/add-people",
                      })
                  : undefined
              }
            />
          )}
          {kind === "group" && (
            <LeaveSection conversationId={conversationId} name={card.name} />
          )}
        </FieldList>
      </NativeHost>
    </Animated.View>
  );
}

/** A channel, named with its space once that loads. */
function ChannelDetails({
  conversation,
  title,
  recent,
}: {
  conversation: Conversation;
  title: string;
  recent: RecentThreads;
}) {
  const { isLoading, space } = useSpace(conversation.spaceId ?? "");
  if (isLoading) return null;
  return (
    <Details
      conversation={conversation}
      recent={recent}
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
  const recent = useRecentThreads(conversationId);
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
  // The title waits for the names it's made of.
  if (recent === undefined || title === "") return null;
  if (conversation.kind === "channel") {
    return (
      <ChannelDetails
        conversation={conversation}
        title={title}
        recent={recent}
      />
    );
  }
  if (conversation.kind === "group") {
    return (
      <Details
        conversation={conversation}
        recent={recent}
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
      recent={recent}
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

/** Details for a conversation: alerts, threads, who is in it, and leaving. */
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
