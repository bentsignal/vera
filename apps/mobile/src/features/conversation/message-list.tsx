import { FlatList } from "react-native";

import type { MessageRow } from "./build-rows";
import type { Message } from "./types";
import { buildMessageRows } from "./build-rows";
import { DaySeparator } from "./day-separator";
import { MessageBubble } from "./message-bubble";

function Row({
  row,
  self,
  authorName,
}: {
  row: MessageRow;
  self: string;
  authorName?: (address: string) => string;
}) {
  if (row.type === "day") return <DaySeparator date={row.date} />;
  const isOwn = row.message.authorId === self;
  return (
    <MessageBubble
      message={row.message}
      isOwn={isOwn}
      authorName={isOwn ? undefined : authorName?.(row.message.authorId)}
      startsGroup={row.startsGroup}
      endsGroup={row.endsGroup}
    />
  );
}

export function MessageList({
  messages,
  self,
  authorName,
  onEndReached,
}: {
  messages: Message[];
  /** The signed-in account's address. */
  self: string;
  /** Labels incoming messages; pass it for groups and channels. */
  authorName?: (address: string) => string;
  /** Called near the oldest message, to load an earlier page. */
  onEndReached: () => void;
}) {
  return (
    <FlatList
      inverted
      data={buildMessageRows(messages)}
      keyExtractor={(row) => row.key}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="py-2"
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      renderItem={({ item }) => (
        <Row row={item} self={self} authorName={authorName} />
      )}
    />
  );
}
