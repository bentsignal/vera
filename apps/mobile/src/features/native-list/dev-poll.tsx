import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { Row } from "./contract";
import { MessageListRow } from "./native";

// `/dev-native-list`'s custom rows: a poll drawn by React inside the native
// list (the escape hatch, `CustomRow`). Voting adds a line, so the row
// grows, which the list measures and makes room for.

const OPTIONS = ["Saturday", "Sunday", "Next weekend"];

function DevPoll() {
  const [vote, setVote] = useState<string | undefined>();
  return (
    <View className="px-4 py-2">
      <View className="bg-fill gap-2 rounded-2xl p-3">
        <Text className="text-footnote text-foreground font-semibold">
          When should we go?
        </Text>
        {OPTIONS.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            className={
              option === vote
                ? "bg-accent rounded-full px-3 py-1.5"
                : "bg-background rounded-full px-3 py-1.5"
            }
            onPress={() => setVote(option === vote ? undefined : option)}
          >
            <Text
              className={
                option === vote
                  ? "text-footnote text-on-accent"
                  : "text-footnote text-foreground"
              }
            >
              {option}
            </Text>
          </Pressable>
        ))}
        {vote !== undefined && (
          <Text className="text-caption text-muted">
            You voted for {vote}. Tap it again to take it back.
          </Text>
        )}
      </View>
    </View>
  );
}

/** Each custom row's React view, as children of the list. */
export function DevCustomRows({ rows }: { rows: readonly Row[] }) {
  // Narrowed here, so the callback below keeps it.
  const Host = MessageListRow;
  if (Host === null) return null;
  return rows
    .filter((row) => row.kind === "custom")
    .map((row) => (
      <Host
        key={row.id}
        rowId={row.id}
        style={{ left: 0, position: "absolute", right: 0, top: 0 }}
      >
        <DevPoll />
      </Host>
    ));
}
