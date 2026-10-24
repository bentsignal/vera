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
 *
 * Over a thread's original (`opensThread`) nothing is above it but the
 * list's 16pt under the screen's header, so it adds only 12pt stacked and
 * 4pt in bubbles. Under it, the label sits as far above the original as
 * the replies' divider sits below it, about 23pt as drawn: its own 4pt
 * stacked (the row adds 20pt) and 8pt in bubbles (the row adds 14pt), or
 * 4pt over a sender's name, which sits lower in its line than a bubble.
 */
function Header({
  stacked,
  opensThread,
  bubbles,
  children,
}: {
  stacked: boolean;
  opensThread: boolean;
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
    <View
      className={cn(
        "flex-row items-center gap-3",
        opensThread ? "pt-3 pb-1" : "pt-7 pb-2",
      )}
    >
      <FadingRule fadeTo="left" />
      <Text className="text-caption text-muted text-center">{children}</Text>
      <FadingRule fadeTo="right" />
    </View>
  );
}

export function DaySeparator({
  date,
  stacked = false,
  opensThread = false,
}: {
  date: Date;
  stacked?: boolean;
  /** Over a thread's original (see `Header`). */
  opensThread?: boolean;
}) {
  return (
    <Header
      stacked={stacked}
      opensThread={opensThread}
      bubbles={opensThread ? "pt-1 pb-3" : "py-3"}
    >
      <Text className="font-semibold">{formatDaySeparator(date)}</Text>
    </Header>
  );
}

/** iMessage's header after a pause: "Today 9:41 AM", day in bold. */
export function TimeHeader({
  date,
  stacked = false,
  opensThread = false,
  named = false,
}: {
  date: Date;
  stacked?: boolean;
  /** Over a thread's original (see `Header`). */
  opensThread?: boolean;
  /** Over a thread's original that shows its sender's name. */
  named?: boolean;
}) {
  const { day, time } = formatTimeHeader(date);
  const thread = named ? "pt-1 pb-1" : "pt-1 pb-2";
  return (
    <Header
      stacked={stacked}
      opensThread={opensThread}
      bubbles={opensThread ? thread : "pt-4 pb-1.5"}
    >
      <Text className="font-semibold">{day}</Text> {time}
    </Header>
  );
}
