import { Text } from "react-native";

import { cn } from "~/lib/cn";
import { formatDaySeparator, formatTimeHeader } from "~/lib/format";

/**
 * Stacked rows open each sender's group with 20pt above it, so in that
 * layout a header gets the same 20pt above and none of its own below,
 * leaving it centered between the messages.
 */
const STACKED = "pt-5 pb-0";

export function DaySeparator({
  date,
  stacked = false,
}: {
  date: Date;
  stacked?: boolean;
}) {
  return (
    <Text
      className={cn(
        "text-caption text-muted text-center font-semibold",
        stacked ? STACKED : "py-3",
      )}
    >
      {formatDaySeparator(date)}
    </Text>
  );
}

/** iMessage's header after a pause: "Today 9:41 AM", day in bold. */
export function TimeHeader({
  date,
  stacked = false,
}: {
  date: Date;
  stacked?: boolean;
}) {
  const { day, time } = formatTimeHeader(date);
  return (
    <Text
      className={cn(
        "text-caption text-muted text-center",
        stacked ? STACKED : "pt-4 pb-1.5",
      )}
    >
      <Text className="font-semibold">{day}</Text> {time}
    </Text>
  );
}
