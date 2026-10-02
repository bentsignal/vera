import type { Space } from "@decentralized-convex/messages";
import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";

import { SymbolIcon } from "~/components/symbol-icon";

export function SpaceRow({ space }: { space: Space }) {
  return (
    <Link
      href={{
        params: { spaceId: space.spaceId },
        pathname: "/spaces/[spaceId]",
      }}
      asChild
    >
      <Pressable className="active:bg-fill flex-row items-center gap-3 pl-4">
        <View
          className="bg-accent size-12 items-center justify-center rounded-xl"
          style={{ borderCurve: "continuous" }}
        >
          <Text className="text-title text-on-accent font-bold">
            {space.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="border-b-hairline border-separator flex-1 flex-row items-center gap-2 py-3 pr-4">
          <View className="flex-1 gap-0.5">
            <Text className="text-headline text-foreground font-semibold">
              {space.name}
            </Text>
            <Text numberOfLines={1} className="text-subhead text-muted">
              {`${space.members.length} members · ${space.channels.length} channels`}
            </Text>
          </View>
          {space.unreadCount > 0 && (
            <View className="bg-accent size-2.5 rounded-full" />
          )}
          <SymbolIcon
            name={{ android: "chevron_right", ios: "chevron.right" }}
            size={14}
            weight="semibold"
            tintColorClassName="accent-subtle"
          />
        </View>
      </Pressable>
    </Link>
  );
}
