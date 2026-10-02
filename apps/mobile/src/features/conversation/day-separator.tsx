import { Text } from "react-native";

import { formatDaySeparator, formatTimeHeader } from "~/lib/format";

export function DaySeparator({ date }: { date: Date }) {
  return (
    <Text className="text-caption text-muted py-3 text-center font-semibold">
      {formatDaySeparator(date)}
    </Text>
  );
}

/** iMessage's header after a pause: "Today 9:41 AM", day in bold. */
export function TimeHeader({ date }: { date: Date }) {
  const { day, time } = formatTimeHeader(date);
  return (
    <Text className="text-caption text-muted pt-4 pb-1.5 text-center">
      <Text className="font-semibold">{day}</Text> {time}
    </Text>
  );
}
