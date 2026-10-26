// Reassure measurements: how long React takes to render the conversation
// (the rows it hands the native list) and its common updates, and how many
// renders they take, compared with the PR's base in CI (`pnpm perf`; see
// README.md). Timings in Jest are React's work only, not drawing, so they
// flag regressions rather than measure frames.
import { useState } from "react";
import { Pressable } from "react-native";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { measureRenders } from "reassure";

import type { Message } from "~/features/conversation/types";
import { Conversation } from "./conversation";
import { message, OLDER, OTHER, PAGE, withReaction } from "./messages";

// The binary's list, drawn as nothing: what's measured is React's work
// building its rows.
jest.mock("~/features/native-list/native", () => ({
  ...jest.requireActual<object>("~/features/native-list/contract"),
  MessageListComposer: null,
  MessageListRow: null,
  MessageListView: () => null,
  nativeSupport: null,
}));

// A fixed day: `useToday` re-arms a timer for each midnight, which
// `runAllTimers` would chase forever.
jest.mock("~/lib/use-today", () => {
  const today = new Date(Date.UTC(2026, 9, 2));
  return { useToday: () => today };
});

beforeEach(() => {
  jest.useFakeTimers();
});

async function settle() {
  await act(() => jest.runAllTimers());
}

/**
 * The conversation showing `from`, until "change" is pressed: then `to`,
 * as when a query's results update. (Re-rendering from outside would drop
 * Reassure's profiler.)
 */
function Changing({
  from,
  to,
}: {
  from: readonly Message[];
  to: readonly Message[];
}) {
  const [messages, setMessages] = useState(from);
  return (
    <>
      <Conversation messages={messages} />
      <Pressable testID="change" onPress={() => setMessages(to)} />
    </>
  );
}

/** Measures the conversation changing from `PAGE` to `to`. */
async function measureChange(to: readonly Message[]) {
  await measureRenders(<Changing from={PAGE} to={to} />, {
    scenario: async () => {
      await settle();
      await fireEvent.press(screen.getByTestId("change"));
      await settle();
    },
  });
}

test("opening a conversation", async () => {
  await measureRenders(<Conversation messages={PAGE} />, { scenario: settle });
});

test("a new message arriving", async () => {
  await measureChange([...PAGE, message(50, { authorId: OTHER })]);
});

test("a reaction arriving", async () => {
  await measureChange(withReaction(PAGE, "m45"));
});

test("an older page loading", async () => {
  await measureChange([...OLDER, ...PAGE]);
});
