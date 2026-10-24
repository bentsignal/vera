import type { ReactNode } from "react";
import { Text } from "react-native";
import { textParts } from "@decentralized-convex/messages";

import type { Mention } from "./types";
import { useOpenProfile } from "~/features/profile/use-open-profile";
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

/**
 * An @mention: bold, in the accent color (or the bubble's own on your
 * accent bubble). Tapping it opens the person's profile, not the message's
 * thread, and holding it still opens the menu.
 */
function MentionLink({
  text,
  accountId,
  onAccent,
}: {
  text: string;
  accountId: string;
  onAccent: boolean;
}) {
  const openProfile = useOpenProfile();
  const press = useMenuPress();
  return (
    <Text
      accessibilityRole="link"
      onPress={() => {
        linkTapped();
        openProfile(accountId);
      }}
      onLongPress={press?.onLongPress}
      onPressIn={press?.onPressIn}
      onPressOut={press?.onPressOut}
      className={onAccent ? "font-semibold" : "text-accent font-semibold"}
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
 * link, in its app if one is installed) and its @mentions tappable, opening
 * the person's profile.
 */
export function LinkedText({
  text,
  mentions,
  className,
  onAccent = false,
  suffix,
}: {
  text: string;
  mentions?: readonly Mention[];
  className: string;
  /** On an accent-colored background (your own bubble). */
  onAccent?: boolean;
  /** Text after it, in its own style, such as " (edited)". */
  suffix?: ReactNode;
}) {
  const parts = new Array<ReactNode>();
  let at = 0;
  for (const range of mentionRanges(text, mentions)) {
    parts.push(...withLinks(text.slice(at, range.start), at));
    parts.push(
      <MentionLink
        key={`mention-${range.start}`}
        text={text.slice(range.start, range.end)}
        accountId={range.accountId}
        onAccent={onAccent}
      />,
    );
    at = range.end;
  }
  parts.push(...withLinks(text.slice(at), at));
  // After the parts, not among them: they're keyed, and it has none.
  return (
    <Text className={className}>
      {parts}
      {suffix}
    </Text>
  );
}
