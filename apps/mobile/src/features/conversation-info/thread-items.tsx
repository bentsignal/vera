import { Platform, View } from "react-native";
import { useRouter } from "expo-router";
import { FieldGroup, RNHostView, Row, Text } from "@expo/ui";

import type { useProfileState } from "~/features/messaging/profiles";
import type { ConversationThread } from "~/features/messaging/thread-lists";
import { Avatar } from "~/components/avatar";
import { ListItem } from "~/components/list-item";
import { SymbolIcon } from "~/components/symbol-icon";
import { replyCountLabel } from "~/features/inbox/thread-links";
import { useAccount } from "~/features/messaging/account";
import { messageSummary } from "~/features/messaging/inbox";
import { MAX_REPLIER_PHOTOS } from "~/features/messaging/thread-lists";
import { secondaryTextStyle } from "~/lib/colors";
import { formatTimeAgo } from "~/lib/format";

type ProfileOf = ReturnType<typeof useProfileState>["profileOf"];

/** Their photos' size: the `xs` avatar. */
const PHOTO_SIZE = 18;

/**
 * The end of a thread's row: an unread dot when you're in it with
 * replies you haven't read, a bell when you're in it, otherwise empty.
 * Always there, at one size: Compose reads a row's trailing slot only
 * when the row mounts.
 */
function Mark({ thread }: { thread: ConversationThread }) {
  return (
    <View className="size-5 items-center justify-center">
      {thread.unreadCount > 0 ? (
        <View
          accessibilityLabel="Unread"
          className="bg-accent size-[10px] rounded-full"
        />
      ) : thread.following ? (
        <SymbolIcon
          accessibilityLabel="You're in this thread"
          name={{ android: "notifications", ios: "bell.fill" }}
          size={13}
          tintColorClassName="accent-muted"
        />
      ) : null}
    </View>
  );
}

/**
 * The newest repliers' photos, sized up front: Compose hosts them at the
 * size React Native lays out.
 */
function ReplierPhotos({
  repliers,
  profileOf,
}: {
  repliers: readonly string[];
  profileOf: ProfileOf;
}) {
  return (
    <View
      className="flex-row gap-[3px]"
      style={{
        height: PHOTO_SIZE,
        width: repliers.length * (PHOTO_SIZE + 3) - 3,
      }}
    >
      {repliers.map((replier) => {
        const profile = profileOf(replier);
        return (
          <Avatar
            key={replier}
            name={profile.displayName}
            size="xs"
            uri={profile.avatarUrl}
          />
        );
      })}
    </View>
  );
}

/**
 * "4 replies · 2h ago", then the newest repliers' photos. SwiftUI sizes
 * the photos with `RNHostView`; Compose takes them as they are, and froze
 * laying out an `RNHostView` there.
 */
function Meta({
  thread,
  profileOf,
}: {
  thread: ConversationThread;
  profileOf: ProfileOf;
}) {
  const repliers = thread.repliers.slice(0, MAX_REPLIER_PHOTOS);
  return (
    <Row alignment="center" spacing={6}>
      <Text textStyle={secondaryTextStyle}>
        {`${replyCountLabel(thread.replyCount)} · ${formatTimeAgo(new Date(thread.lastReplyAt))}`}
      </Text>
      {Platform.OS === "android" ? (
        <ReplierPhotos repliers={repliers} profileOf={profileOf} />
      ) : (
        <RNHostView matchContents>
          <ReplierPhotos repliers={repliers} profileOf={profileOf} />
        </RNHostView>
      )}
    </Row>
  );
}

/**
 * A thread in a conversation's list: the original's author, its first
 * two lines, then its replies and newest repliers. Tapping it opens the
 * thread.
 */
export function ThreadListItem({
  conversationId,
  title,
  thread,
  profileOf,
}: {
  conversationId: string;
  /** The conversation's name, shown on the thread page until it loads. */
  title: string;
  thread: ConversationThread;
  profileOf: ProfileOf;
}) {
  const router = useRouter();
  const { address } = useAccount();
  const { root } = thread;
  const author = root === null ? null : profileOf(root.authorId);
  return (
    <ListItem
      leading={
        <Avatar
          name={author?.displayName ?? ""}
          size="row"
          uri={author?.avatarUrl}
        />
      }
      supportingText={<Meta thread={thread} profileOf={profileOf} />}
      trailing={<Mark thread={thread} />}
      onPress={() =>
        router.push({
          params: {
            account: address,
            conversationId,
            threadId: thread.threadId,
            title,
          },
          pathname: "/thread/[threadId]",
        })
      }
    >
      <Text numberOfLines={2}>
        {root === null ? "Message unavailable" : messageSummary(root)}
      </Text>
    </ListItem>
  );
}

/**
 * The info page's Threads: the three with the newest replies, then See
 * All, which opens every thread in the conversation, searchable. Nothing
 * when it has none.
 */
export function ThreadsSection({
  conversationId,
  title,
  threads,
  profileOf,
}: {
  conversationId: string;
  title: string;
  threads: readonly ConversationThread[];
  profileOf: ProfileOf;
}) {
  const router = useRouter();
  const { address } = useAccount();
  if (threads.length === 0) return null;
  return (
    <FieldGroup.Section title="Threads">
      {threads.map((thread) => (
        <ThreadListItem
          key={thread.threadId}
          conversationId={conversationId}
          title={title}
          thread={thread}
          profileOf={profileOf}
        />
      ))}
      <ListItem
        trailing={
          <SymbolIcon
            name={{ android: "chevron_right", ios: "chevron.right" }}
            size={14}
            weight="semibold"
            tintColorClassName="accent-subtle"
          />
        }
        onPress={() =>
          router.push({
            params: { account: address, conversationId, title },
            pathname: "/conversation-threads/[conversationId]",
          })
        }
      >
        <Text>See All</Text>
      </ListItem>
    </FieldGroup.Section>
  );
}
