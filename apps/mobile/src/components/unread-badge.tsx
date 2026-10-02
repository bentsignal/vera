import { Text, View } from "react-native";

export function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View className="bg-accent h-5 min-w-5 items-center justify-center rounded-full px-1.5">
      <Text className="text-caption text-on-accent font-semibold">
        {count > 99 ? "99+" : count}
      </Text>
    </View>
  );
}
