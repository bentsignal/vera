import { Pressable, Text } from "react-native";
import { fireEvent, render, userEvent } from "@testing-library/react-native";

import {
  MenuTargetView,
  MessageActionsProvider,
  MessageTargetProvider,
} from "~/features/conversation/message-actions";
import { MessageRowTarget } from "~/features/conversation/row-target";
import { message } from "./messages";

const row = message(1);

async function mount() {
  const openThread = jest.fn();
  const media = jest.fn();
  const view = await render(
    <MessageActionsProvider
      onOpenThread={openThread}
      onToggleReaction={jest.fn()}
      onViewReactions={jest.fn()}
    >
      <MessageRowTarget message={row}>
        <Text>Row text</Text>
        <MessageTargetProvider message={row} align="start" shape="plain">
          <MenuTargetView>
            <Text>Part text</Text>
          </MenuTargetView>
        </MessageTargetProvider>
        <Pressable onPress={media}>
          <Text>Media control</Text>
        </Pressable>
      </MessageRowTarget>
    </MessageActionsProvider>,
  );
  return { ...view, openThread, media };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test.each(["Row text", "Part text"])(
  "%s opens its thread on the first release and never waits for a second tap",
  async (text) => {
    const view = await mount();
    await fireEvent.press(view.getByText(text));
    expect(view.openThread).toHaveBeenCalledTimes(1);
    expect(view.openThread).toHaveBeenCalledWith(row);
    await fireEvent.press(view.getByText(text));
    expect(view.openThread).toHaveBeenCalledTimes(2);
  },
);

test("a nested control retains its press without opening the row's thread", async () => {
  const view = await mount();
  await fireEvent.press(view.getByText("Media control"));
  expect(view.media).toHaveBeenCalledTimes(1);
  expect(view.openThread).not.toHaveBeenCalled();
});

test("holding a text part suppresses the thread press", async () => {
  const view = await mount();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await user.longPress(view.getByText("Part text"), { duration: 400 });
  expect(view.openThread).not.toHaveBeenCalled();
});
