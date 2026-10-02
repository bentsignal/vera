import { FlatList } from "react-native";

import type { MessageRow } from "./build-rows";
import type { Message } from "./types";
import { findPerson, me } from "~/mock/people";
import { buildMessageRows } from "./build-rows";
import { DaySeparator } from "./day-separator";
import { MessageBubble } from "./message-bubble";

function Row({ row, showAuthors }: { row: MessageRow; showAuthors: boolean }) {
  if (row.type === "day") return <DaySeparator date={row.date} />;
  const isOwn = row.message.authorId === me.id;
  return (
    <MessageBubble
      message={row.message}
      isOwn={isOwn}
      authorName={
        showAuthors && !isOwn
          ? findPerson(row.message.authorId)?.displayName
          : undefined
      }
      startsGroup={row.startsGroup}
      endsGroup={row.endsGroup}
    />
  );
}

export function MessageList({
  messages,
  showAuthors,
}: {
  messages: Message[];
  /** Label incoming messages with the author's name (groups and channels). */
  showAuthors: boolean;
}) {
  return (
    <FlatList
      inverted
      data={buildMessageRows(messages)}
      keyExtractor={(row) => row.key}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="py-2"
      renderItem={({ item }) => <Row row={item} showAuthors={showAuthors} />}
    />
  );
}
