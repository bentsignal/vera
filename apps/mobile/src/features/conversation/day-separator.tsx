import { Text } from "react-native";

import { formatDaySeparator } from "~/lib/format";

export function DaySeparator({ date }: { date: Date }) {
  return (
    <Text className="text-caption text-muted py-3 text-center font-semibold">
      {formatDaySeparator(date)}
    </Text>
  );
}
