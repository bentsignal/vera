import type { Reaction } from "@decentralized-convex/messages";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useQuery } from "@tanstack/react-query";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { Avatar } from "~/components/avatar";
import { useAccount } from "~/features/messaging/account";
import { useProfiles } from "~/features/messaging/profiles";
import { pdsResult } from "~/features/messaging/results";
import { cn } from "~/lib/cn";

/** Each emoji with who used it, most used first, earliest reactor first. */
function byEmoji(reactions: readonly Reaction[]) {
  const groups = new Map<string, Reaction[]>();
  for (const reaction of reactions) {
    groups.set(reaction.emoji, [
      ...(groups.get(reaction.emoji) ?? []),
      reaction,
    ]);
  }
  return [...groups]
    .map(([emoji, rows]) => ({
      accounts: [...rows]
        .sort((a, b) => a.reactedAt - b.reactedAt)
        .map((row) => row.accountId),
      emoji,
    }))
    .sort((a, b) => b.accounts.length - a.accounts.length);
}

function EmojiTab({
  emoji,
  count,
  selected,
  onPress,
}: {
  emoji: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={`${emoji} ${count}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        "h-9 flex-row items-center gap-1.5 rounded-full px-3.5",
        selected ? "bg-accent/15" : "bg-fill",
      )}
    >
      <Text style={{ fontSize: 17 }}>{emoji}</Text>
      <Text
        className={cn(
          "text-subhead font-semibold",
          selected ? "text-accent" : "text-muted",
        )}
      >
        {count}
      </Text>
    </Pressable>
  );
}

function Person({ address }: { address: string }) {
  const profileOf = useProfiles([address]);
  const { avatarUrl, displayName } = profileOf(address);
  return (
    <View className="flex-row items-center gap-3 px-5 py-2.5">
      <Avatar name={displayName} size="row" uri={avatarUrl} />
      <View className="flex-1">
        <Text numberOfLines={1} className="text-body text-foreground">
          {displayName}
        </Text>
        <Text numberOfLines={1} className="text-footnote text-muted">
          {address}
        </Text>
      </View>
    </View>
  );
}

/**
 * Who reacted to a message, like Discord's sheet: each emoji with its count
 * across the top, and the people who used the selected one below.
 */
export function ReactionsSheet({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) {
  const { address } = useAccount();
  const { data } = useQuery(
    pdsQuery({
      args: { conversationId, messageIds: [messageId] },
      options: { select: (result) => pdsResult(result)?.flat() },
      query: pds.messages.reactions,
      session: address,
    }),
  );
  const [picked, setPicked] = useState<string>();
  if (data === undefined) return null;
  const groups = byEmoji(data);
  const current =
    groups.find((group) => group.emoji === picked) ?? groups.at(0);
  return (
    <Animated.View entering={FadeIn.duration(220)} className="flex-1 pt-2">
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-5 py-2"
        >
          {groups.map((group) => (
            <EmojiTab
              key={group.emoji}
              emoji={group.emoji}
              count={group.accounts.length}
              selected={group.emoji === current?.emoji}
              onPress={() => setPicked(group.emoji)}
            />
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerClassName="pt-1 pb-8">
        {current?.accounts.map((account) => (
          <Person key={account} address={account} />
        ))}
      </ScrollView>
    </Animated.View>
  );
}
