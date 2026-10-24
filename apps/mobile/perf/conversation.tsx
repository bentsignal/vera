// The conversation's list, as the conversation screen renders it.
import { makeMutable } from "react-native-reanimated";

import type { Message } from "~/features/conversation/types";
import { MessageList } from "~/features/conversation/message-list";
import { SELF } from "./messages";

/** The same profile object each time, as `useProfileState` gives. */
const profile = { avatarUrl: null, displayName: "Maya" };
function profileOf() {
  return profile;
}
/** A composer laid out once, as on iOS. */
const COMPOSER = {
  laidOut: 56,
  live: makeMutable(56),
  room: makeMutable(56),
  sent: makeMutable(false),
  stepsUntil: makeMutable(0),
};
/** Nobody typing, the same array each time. */
const NOBODY = Object.freeze<string[]>([]);

export function Conversation({ messages }: { messages: readonly Message[] }) {
  return (
    <MessageList
      messages={messages}
      self={SELF}
      layout="bubbles"
      profileOf={profileOf}
      showAuthors
      hasNewer={false}
      onLoadOlder={() => undefined}
      onLoadNewer={() => undefined}
      onJumpToLatest={() => undefined}
      bottomInset={0}
      topInset={0}
      composerHeight={COMPOSER}
      typists={NOBODY}
      onToggleReaction={() => undefined}
      onViewReactions={() => undefined}
    />
  );
}
