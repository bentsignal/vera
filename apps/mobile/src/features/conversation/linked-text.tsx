import type { ReactNode } from "react";
import { Text } from "react-native";
import { textParts } from "@decentralized-convex/messages";

import type { Mention } from "./types";
import { useAccount } from "~/features/messaging/account";
import { openLink } from "~/lib/open-link";
import { linkTapped } from "./link-tap";
import { mentionRanges } from "./mention-text";
import { useMenuPress } from "./row-touch";

/**
 * A link in the text: underlined, and holding it still opens the menu.
 * Tapping it opens the link, not the message's thread.
 */
function Link({ text, url }: { text: string; url: string }) {
  const press = useMenuPress();
  return (
    <Text
      accessibilityRole="link"
      onPress={() => {
        linkTapped();
        openLink(url);
      }}
      onLongPress={press?.onLongPress}
      onPressIn={press?.onPressIn}
      onPressOut={press?.onPressOut}
      className="underline"
    >
      {text}
    </Text>
  );
}

/** Text with its links, starting `offset` into the message (for keys). */
function withLinks(text: string, offset: number) {
  return textParts(text).map((part) =>
    part.url === undefined ? (
      part.text
    ) : (
      <Link key={offset + part.start} text={part.text} url={part.url} />
    ),
  );
}

/**
 * A message's text with its links underlined and tappable (a tap opens the
 * link, in its app if one is installed) and its @mentions in bold, in the
 * accent color where they mention you.
 */
export function LinkedText({
  text,
  mentions,
  className,
  suffix,
}: {
  text: string;
  mentions?: readonly Mention[];
  className: string;
  /** Text after it, in its own style, such as " (edited)". */
  suffix?: ReactNode;
}) {
  const { address } = useAccount();
  const parts = new Array<ReactNode>();
  let at = 0;
  for (const range of mentionRanges(text, mentions)) {
    parts.push(...withLinks(text.slice(at, range.start), at));
    parts.push(
      <Text
        key={`mention-${range.start}`}
        className={
          range.accountId === address
            ? "text-accent font-semibold"
            : "font-semibold"
        }
      >
        {text.slice(range.start, range.end)}
      </Text>,
    );
    at = range.end;
  }
  parts.push(...withLinks(text.slice(at), at));
  return (
    <Text className={className}>
      {parts}
      {suffix}
    </Text>
  );
}
