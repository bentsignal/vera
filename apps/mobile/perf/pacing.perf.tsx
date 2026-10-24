// Pacing others' new messages (`usePacedMessages`): in a busy conversation
// they wait while one rises in, then rise in together, so the list redraws
// a few times a second instead of once per message. And nothing gets stuck:
// a rise that starts as the last one ends still finishes.
import { act, render } from "@testing-library/react-native";

import type { Message } from "~/features/conversation/types";
import {
  PACE_MS,
  usePacedMessages,
} from "~/features/conversation/paced-messages";
import { message, OTHER, PAGE, SELF } from "./messages";

/** What the list was given each time it changed. */
const mockShown = new Array<readonly Message[]>();

function Paced({ messages }: { messages: readonly Message[] }) {
  const shown = usePacedMessages(messages, SELF);
  if (mockShown.at(-1) !== shown) mockShown.push(shown);
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockShown.length = 0;
});

test("a burst from others redraws the list a few times, and every message shows", async () => {
  const view = await render(<Paced messages={PAGE} />);
  let messages = PAGE;
  // Twenty messages, one every 200ms: four seconds.
  for (let index = 50; index < 70; index += 1) {
    messages = [...messages, message(index, { authorId: OTHER })];
    await view.rerender(<Paced messages={messages} />);
    await act(() => jest.advanceTimersByTime(200));
  }
  await act(() => jest.advanceTimersByTime(PACE_MS * 2));
  expect(mockShown.at(-1)).toEqual(messages);
  // The first at once, then one redraw per rise at most.
  expect(mockShown.length - 1).toBeLessThanOrEqual(
    Math.ceil((20 * 200) / PACE_MS) + 1,
  );
});

test("the first message after a pause, and your own, show at once", async () => {
  const view = await render(<Paced messages={PAGE} />);
  const theirs = [...PAGE, message(50, { authorId: OTHER })];
  await view.rerender(<Paced messages={theirs} />);
  expect(mockShown.at(-1)).toBe(theirs);
  // Yours, during their rise.
  const mine = [...theirs, message(51, { authorId: SELF })];
  await view.rerender(<Paced messages={mine} />);
  expect(mockShown.at(-1)).toBe(mine);
});
