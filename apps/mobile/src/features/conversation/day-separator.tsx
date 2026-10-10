import type { ReactNode } from "react";
import { useId } from "react";
import { Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { cn } from "~/lib/cn";
import { formatDaySeparator, formatTimeHeader } from "~/lib/format";

/** How strong a rule is beside the text, so it stays faint. */
const PEAK = 0.6;

/** A hairline that fades out toward the screen edge on its `fadeTo` side. */
function FadingRule({ fadeTo }: { fadeTo: "left" | "right" }) {
  const id = useId();
  const color = useCSSVariable("--color-separator");
  const fill = typeof color === "string" ? color : "gray";
  return (
    <View className="h-px flex-1">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop
              offset="0"
              stopColor={fill}
              stopOpacity={fadeTo === "left" ? 0 : PEAK}
            />
            <Stop
              offset="1"
              stopColor={fill}
              stopOpacity={fadeTo === "left" ? PEAK : 0}
            />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * A header between messages. Stacked rows open each sender's group with
 * 20pt above it, so in that layout the header takes 28pt above and 8pt of
 * its own below, even on both sides, with a faint rule either side of the
 * text. Bubbles keep a plain centered label.
 */
function Header({
  stacked,
  bubbles,
  children,
}: {
  stacked: boolean;
  /** The label's padding in the bubbles layout. */
  bubbles: string;
  children: ReactNode;
}) {
  if (!stacked) {
    return (
      <Text className={cn("text-caption text-muted text-center", bubbles)}>
        {children}
      </Text>
    );
  }
  return (
    <View className="flex-row items-center gap-3 pt-7 pb-2">
      <FadingRule fadeTo="left" />
      <Text className="text-caption text-muted text-center">{children}</Text>
      <FadingRule fadeTo="right" />
    </View>
  );
}

export function DaySeparator({
  date,
  stacked = false,
}: {
  date: Date;
  stacked?: boolean;
}) {
  return (
    <Header stacked={stacked} bubbles="py-3">
      <Text className="font-semibold">{formatDaySeparator(date)}</Text>
    </Header>
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
    <Header stacked={stacked} bubbles="pt-4 pb-1.5">
      <Text className="font-semibold">{day}</Text> {time}
    </Header>
  );
}
