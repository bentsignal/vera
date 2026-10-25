import type { Message } from "@decentralized-convex/messages";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { MAX_ACTIVITY_MESSAGES } from "@decentralized-convex/messages";

import type { ActivityEntry } from "./activity";
import type { useProfileState } from "~/features/messaging/profiles";
import { Avatar } from "~/components/avatar";
import { usernameOf } from "~/features/messaging/profiles";
import { formatInboxTimestamp } from "~/lib/format";
import { actorsOf, markSeen } from "./activity";
import { activityDestination } from "./activity-destination";

type ProfileOf = ReturnType<typeof useProfileState>["profileOf"];

/** The most different emoji a reactions row lists. */
const MAX_EMOJI = 5;

/** "Maya", "Maya and Leo", or "Maya and 3 others". */
function names(actors: readonly string[], profileOf: ProfileOf) {
  const [first = "", second = ""] = actors.map(
    (actor) => profileOf(actor).displayName,
  );
  if (actors.length <= 1) return first;
  if (actors.length === 2) return `${first} and ${second}`;
  return `${first} and ${actors.length - 1} others`;
}

/** A message's text, or what it sent instead ("a photo"). */
function messageText(message: Message) {
  if (message.body.length > 0) return message.body;
  const count = message.attachments.length;
  if (count > 1) return `${count} attachments`;
  const kind = message.attachments[0]?.kind ?? "file";
  return { file: "a file", image: "a photo", video: "a video" }[kind];
}

function Bold({ children }: { children: string }) {
  return <Text className="font-semibold">{children}</Text>;
}

/** What happened, naming who did it. */
function Headline({
  entry,
  profileOf,
}: {
  entry: ActivityEntry;
  profileOf: ProfileOf;
}) {
  const { item, title } = entry;
  const who = names(actorsOf(item), profileOf);
  if (item.kind === "mention") {
    return (
      <>
        <Bold>{who}</Bold> mentioned you in <Bold>{title}</Bold>
      </>
    );
  }
  if (item.kind === "reply") {
    return (
      <>
        <Bold>{who}</Bold> replied to your message in <Bold>{title}</Bold>
      </>
    );
  }
  if (item.kind === "reactions") {
    const emoji = [...new Set(item.reactions.map(({ emoji }) => emoji))];
    return (
      <>
        <Bold>{who}</Bold> reacted {emoji.slice(0, MAX_EMOJI).join(" ")}
      </>
    );
  }
  const place =
    item.conversation.kind === "direct" ? null : (
      <>
        {" in "}
        <Bold>{title}</Bold>
      </>
    );
  if (item.kind === "thread") {
    const yours = item.root?.authorId === entry.account;
    return (
      <>
        <Bold>{who}</Bold>{" "}
        {yours ? "replied to your message" : "replied in a thread"}
        {place}
      </>
    );
  }
  return (
    <>
      <Bold>{who}</Bold>
      {place}
    </>
  );
}

/** The message: theirs, or yours that they reacted to. */
function body(entry: ActivityEntry, profileOf: ProfileOf) {
  const { item } = entry;
  if (item.kind === "mention" || item.kind === "reply") {
    return messageText(item.message);
  }
  if (item.kind === "reactions") {
    const { message } = item;
    return message.body.length > 0
      ? `“${message.body}”`
      : `To ${messageText(message).replace(/^an? /, "your ")}`;
  }
  const { authorId } = item.latest;
  const text = messageText(item.latest);
  return item.authors.length > 1
    ? `${profileOf(authorId).displayName}: ${text}`
    : text;
}

/** "3 messages", or "99+ replies". */
function counted(count: number, noun: string) {
  const many = count >= MAX_ACTIVITY_MESSAGES;
  return `${count}${many ? "+" : ""} ${noun}`;
}

/** How many messages or replies a row holds, when it's more than one. */
function countOf(item: ActivityEntry["item"]) {
  if (item.kind !== "messages" && item.kind !== "thread") return null;
  if (item.count <= 1) return null;
  return counted(item.count, item.kind === "thread" ? "replies" : "messages");
}

/** For a reply, the message of yours it answers. */
function quotedNote(item: ActivityEntry["item"]) {
  const quoted = item.kind === "reply" ? item.message.quote?.body : undefined;
  return quoted === undefined || quoted.length === 0 ? null : `On “${quoted}”`;
}

/** Where it happened and how much, under the message. */
function footnote(entry: ActivityEntry, showAccount: boolean) {
  const { item, title } = entry;
  const { kind, spaceName } = item.conversation;
  const parts = [];
  if (item.kind === "thread" && item.root !== null) {
    parts.push(`On “${messageText(item.root)}”`);
  }
  const quoted = quotedNote(item);
  if (quoted !== null) parts.push(quoted);
  if (item.kind === "reactions" && kind !== "direct") parts.push(`in ${title}`);
  if (spaceName !== undefined) parts.push(spaceName);
  const count = countOf(item);
  if (count !== null) parts.push(count);
  if (showAccount) parts.push(usernameOf(entry.account));
  return parts.join(" · ");
}

/**
 * One Activity row: the person who acted, what happened (a reaction's
 * emoji in its headline), and a dot until it's been seen. Tapping opens
 * the conversation, at the message for a reaction, a mention, or a
 * reply, or a thread.
 */
export function ActivityRow({
  entry,
  profileOf,
  showAccount,
}: {
  entry: ActivityEntry;
  profileOf: ProfileOf;
  showAccount: boolean;
}) {
  const router = useRouter();
  const { item, unseen } = entry;
  const actor = actorsOf(item)[0] ?? "";
  const profile = profileOf(actor);
  const note = footnote(entry, showAccount);

  /** Opening a row is seeing it: its dot is gone when you come back. */
  function open() {
    if (unseen) void markSeen([entry]);
    router.push(activityDestination(entry));
  }

  return (
    <Pressable className="active:bg-fill flex-row" onPress={open}>
      <View className="w-6 items-center pt-[28px]">
        {/* Fades away once the row has been seen, rather than vanishing. */}
        {unseen && (
          <Animated.View
            exiting={FadeOut.duration(400)}
            accessibilityLabel="New"
            className="bg-accent size-[10px] rounded-full"
          />
        )}
      </View>
      <View className="pt-2.5">
        <Avatar
          name={profile.displayName}
          size="list"
          uri={profile.avatarUrl}
        />
      </View>
      <View className="border-b-hairline border-separator ml-3 flex-1 gap-0.5 py-2.5 pr-4">
        <View className="flex-row items-start gap-1.5">
          <Text
            numberOfLines={2}
            className="text-subhead text-foreground flex-1 leading-[20px]"
          >
            <Headline entry={entry} profileOf={profileOf} />
          </Text>
          <Text className="text-subhead text-muted leading-[20px]">
            {formatInboxTimestamp(new Date(item.at))}
          </Text>
        </View>
        <Text
          numberOfLines={2}
          className="text-subhead text-muted leading-[20px]"
        >
          {body(entry, profileOf)}
        </Text>
        {note.length > 0 && (
          <Text numberOfLines={1} className="text-footnote text-muted">
            {note}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
