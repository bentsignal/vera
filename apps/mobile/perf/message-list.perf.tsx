// Render budgets for the conversation: how many messages re-render when one
// thing changes. Every row on screen redrawing for one new message is what
// made scrolling and sending janky (rows and profiles rebuilt on each
// update defeated the React Compiler's memoization: 824 row renders for one
// send; later, a hook the compiler skipped re-rendered every message's
// press handling on each update). Each test renders the real list and
// counts how often message bubbles and their pressable parts render; a
// change that makes unchanged messages redraw fails here.
import type { ComponentProps, createElement } from "react";
import { act, render } from "@testing-library/react-native";

import type * as ActionsModule from "~/features/conversation/message-actions";
import type * as BubbleModule from "~/features/conversation/message-bubble";
import type { Message } from "~/features/conversation/types";
import { Conversation } from "./conversation";
import { message, OLDER, OTHER, PAGE, withReaction } from "./messages";

/** How many times each message's bubble rendered, by message ID. */
const mockRenders = new Map<string, number>();
/** How many times a message's reactions and press handling rendered. */
const mockActions = { renders: 0 };

jest.mock("~/features/conversation/message-bubble", () => {
  const react = jest.requireActual<{ createElement: typeof createElement }>(
    "react",
  );
  const actual = jest.requireActual<typeof BubbleModule>(
    "~/features/conversation/message-bubble",
  );
  return {
    MessageBubble: (props: ComponentProps<typeof actual.MessageBubble>) => {
      const { id } = props.message;
      mockRenders.set(id, (mockRenders.get(id) ?? 0) + 1);
      return react.createElement(actual.MessageBubble, props);
    },
  };
});

jest.mock("~/features/conversation/message-actions", () => {
  const actual = jest.requireActual<typeof ActionsModule>(
    "~/features/conversation/message-actions",
  );
  return {
    ...actual,
    // Each message's reactions read the actions once per render, including
    // a render because the actions changed.
    useMessageActions: () => {
      mockActions.renders += 1;
      return actual.useMessageActions();
    },
  };
});

/** Renders, forgets the first renders, and returns a re-render function. */
async function mount(messages: readonly Message[]) {
  const view = await render(<Conversation messages={messages} />);
  await act(() => jest.runAllTimers());
  mockRenders.clear();
  mockActions.renders = 0;
  return async (next: readonly Message[]) => {
    await view.rerender(<Conversation messages={next} />);
    await act(() => jest.runAllTimers());
  };
}

/**
 * Bubbles that rendered again, other than `except`'s. A message's reactions
 * render with it (twice, as a reaction lands), and its row's thread target
 * once, never on their own.
 */
function rerendered(except?: string) {
  expect(mockActions.renders).toBeLessThanOrEqual(3 * mockRenders.size);
  return [...mockRenders.keys()].filter((id) => id !== except);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockRenders.clear();
  mockActions.renders = 0;
});

test("a new message renders only itself and the row it joins", async () => {
  const update = await mount(PAGE);
  await update([...PAGE, message(50, { authorId: OTHER })]);
  // The previous newest row loses its tail as the new one joins its run.
  expect(rerendered("m50").length).toBeLessThanOrEqual(1);
});

test("a reaction renders only the message it's on", async () => {
  const update = await mount(PAGE);
  await update(withReaction(PAGE, "m45"));
  expect(rerendered()).toEqual(["m45"]);
});

test("loading an older page renders none of the messages already shown", async () => {
  const update = await mount(PAGE);
  await update([...OLDER, ...PAGE]);
  const shown = new Set(PAGE.map((item) => item.id));
  // The oldest shown message may gain a header or join a run: one at most.
  expect(rerendered().filter((id) => shown.has(id)).length).toBeLessThanOrEqual(
    1,
  );
});

test("a burst of messages renders only the messages each one adds or joins", async () => {
  // Messages arriving one after another into a long conversation, as when
  // a group is busy.
  const history = [...OLDER, ...PAGE];
  const update = await mount(history);
  let shown = history;
  const added = new Set<string>();
  for (let index = 50; index < 80; index += 1) {
    const next = message(index, { authorId: OTHER });
    added.add(next.id);
    shown = [...shown, next];
    await update(shown);
  }
  // Besides the new ones, each joins the run of the one before it, which
  // loses its tail: the newest of the history, once.
  expect(rerendered().filter((id) => !added.has(id))).toEqual(["m49"]);
});
