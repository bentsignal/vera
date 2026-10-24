import type { Reaction } from "@decentralized-convex/messages";
import { useState } from "react";
import { FlatList, Platform, Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  pdsQuery,
  pdsSessionQueryKey,
} from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { ReactionPart } from "~/features/messaging/reactions";
import { Avatar } from "~/components/avatar";
import { useAccount } from "~/features/messaging/account";
import { loadedBatchWith } from "~/features/messaging/loaded-batch";
import { useProfiles } from "~/features/messaging/profiles";
import { reactionPart, reactionsQuery } from "~/features/messaging/reactions";
import { pdsResult } from "~/features/messaging/results";
import { cn } from "~/lib/cn";
import { selectionTick } from "~/lib/native-extras";

/** The tab listing everyone, whatever they reacted with. */
const ALL = "all";

const IS_ANDROID = Platform.OS === "android";

/** Everyone who reacted, earliest first, each with all their emoji in order. */
function byPerson(reactions: readonly Reaction[]) {
  const people = new Map<string, string[]>();
  for (const { accountId, emoji } of [...reactions].sort(
    (a, b) => a.reactedAt - b.reactedAt,
  )) {
    people.set(accountId, [...(people.get(accountId) ?? []), emoji]);
  }
  return [...people].map(([address, emojis]) => ({ address, emojis }));
}

/** Each emoji with who used it, most used first. */
function byEmoji(reactors: ReturnType<typeof byPerson>) {
  const groups = new Map<string, string[]>();
  for (const { address, emojis } of reactors) {
    for (const emoji of emojis) {
      groups.set(emoji, [...(groups.get(emoji) ?? []), address]);
    }
  }
  return [...groups]
    .map(([emoji, accounts]) => ({ accounts, emoji }))
    .sort((a, b) => b.accounts.length - a.accounts.length);
}

function Tab({
  label,
  emoji,
  count,
  selected,
  onPress,
}: {
  label: string;
  emoji?: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={`${label}, ${count}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        "h-9 flex-row items-center gap-1.5 rounded-full px-3.5",
        selected ? "bg-accent/15" : "bg-fill",
      )}
    >
      {emoji === undefined ? (
        <Text
          className={cn(
            "text-subhead font-semibold",
            selected ? "text-accent" : "text-foreground",
          )}
        >
          {label}
        </Text>
      ) : (
        <Text style={{ fontSize: 18 }}>{emoji}</Text>
      )}
      <Text
        className={cn(
          "text-subhead font-semibold tabular-nums",
          selected ? "text-accent" : "text-muted",
        )}
      >
        {count}
      </Text>
    </Pressable>
  );
}

function Person({
  address,
  emojis,
}: {
  address: string;
  /** What they reacted with, shown at the end of the row. */
  emojis: readonly string[];
}) {
  const profileOf = useProfiles([address]);
  const { avatarUrl, displayName } = profileOf(address);
  return (
    <View
      accessible
      accessibilityLabel={`${displayName}, ${emojis.join(" ")}`}
      className="flex-row items-center gap-3 px-5 py-2.5"
    >
      <Avatar name={displayName} size="list" uri={avatarUrl} />
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className="text-body text-foreground font-semibold"
        >
          {displayName}
        </Text>
        <Text numberOfLines={1} className="text-subhead text-muted">
          {address}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 24 }}>
        {emojis.join("")}
      </Text>
    </View>
  );
}

/** The sheet's title, under a drag handle on Android (iOS draws its own). */
function Title() {
  return (
    <>
      {IS_ANDROID && (
        <View className="bg-subtle mt-3 h-1 w-8 self-center rounded-full" />
      )}
      <Text
        accessibilityRole="header"
        className={cn(
          "text-headline text-foreground pb-1 text-center font-semibold",
          IS_ANDROID ? "pt-4" : "pt-6",
        )}
      >
        Reactions
      </Text>
    </>
  );
}

/**
 * The reactions the sheet lists, from the conversation's query that has
 * this message's: by time for its newest messages (`since`), otherwise the
 * one for this message's batch. Those are already loaded and live, so the
 * sheet shows them at once. A query of its own would show an empty sheet
 * until the PDS answered, which on a slow connection looked like nobody
 * had reacted.
 */
function useMessageReactions(
  conversationId: string,
  messageId: string,
  since: number | undefined,
) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [messageIds] = useState(
    () =>
      loadedBatchWith(
        queryClient.getQueriesData({ queryKey: pdsSessionQueryKey(address) }),
        (ids) => reactionsQuery(address, conversationId, ids).queryKey,
        messageId,
      ) ?? [messageId],
  );
  const { data } = useQuery(
    pdsQuery({
      args:
        since === undefined
          ? { conversationId, messageIds }
          : { conversationId, since },
      options: { select: (result) => pdsResult(result)?.flat() },
      query: pds.messages.reactions,
      session: address,
    }),
  );
  return data;
}

/**
 * Who reacted to a part of a message (see `ReactionPart`), like Discord's sheet: a tab for everyone and
 * one per emoji with its count, and the people under the selected tab, each
 * with what they reacted with. It draws its own title, since a native
 * header on a sheet floats over the tabs.
 */
export function ReactionsSheet({
  conversationId,
  messageId,
  part,
  emoji,
  since,
}: {
  conversationId: string;
  messageId: string;
  part: ReactionPart;
  /** The tab to open on, such as the reaction that was held. */
  emoji?: string;
  /**
   * The conversation's query by time that has this message's reactions,
   * when it's one of the newest (see `ReactionSources`).
   */
  since?: number;
}) {
  const data = useMessageReactions(conversationId, messageId, since);
  const [picked, setPicked] = useState(emoji ?? ALL);
  const reactors = byPerson(
    (data ?? []).filter(
      (reaction) =>
        reaction.messageId === messageId && reactionPart(reaction) === part,
    ),
  );
  const groups = byEmoji(reactors);
  // With one emoji, everyone already used it: no tabs, just the people.
  const tabs = groups.length > 1;
  const current = tabs
    ? groups.find((group) => group.emoji === picked)
    : undefined;
  const shown =
    current === undefined
      ? reactors
      : current.accounts.map((account) => ({
          address: account,
          emojis: [current.emoji],
        }));
  const selected = current?.emoji ?? ALL;

  function pick(tab: string) {
    if (tab === selected) return;
    selectionTick();
    setPicked(tab);
  }

  return (
    // iOS draws the sheet as glass, with its own grabber. Android's sheet
    // has neither, so it gets a background and a handle that shows it drags.
    <View className={cn("flex-1", IS_ANDROID && "bg-background-elevated")}>
      <Title />
      {data !== undefined && (
        <Animated.View entering={FadeIn.duration(220)} className="flex-1">
          {tabs && (
            <View>
              <FlatList
                horizontal
                data={[
                  { count: reactors.length, tab: ALL },
                  ...groups.map((group) => ({
                    count: group.accounts.length,
                    tab: group.emoji,
                  })),
                ]}
                keyExtractor={(item) => item.tab}
                renderItem={({ item }) => (
                  <Tab
                    label={item.tab === ALL ? "All" : item.tab}
                    emoji={item.tab === ALL ? undefined : item.tab}
                    count={item.count}
                    selected={item.tab === selected}
                    onPress={() => pick(item.tab)}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2 px-5 pt-3 pb-2"
              />
            </View>
          )}
          <FlatList
            data={shown}
            keyExtractor={(reactor) => reactor.address}
            renderItem={({ item: reactor }) => (
              <Person address={reactor.address} emojis={reactor.emojis} />
            )}
            contentContainerClassName="pt-2 pb-10"
          />
        </Animated.View>
      )}
    </View>
  );
}
