import type { ReactNode, Ref } from "react";
import { useImperativeHandle } from "react";
import { Pressable, Text, View } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import type { DevHold } from "~/features/native-list/dev-menu-layout";
import type {
  ComposerHost,
  MessageListViewMethods,
  MessageListViewProps,
} from "~/features/native-list/native";
import { DevComposerLayout } from "~/features/native-list/dev-composer-layout";

const mockLand = jest.fn(() => Promise.resolve());
const mockList = jest.fn((_props: MessageListViewProps) => undefined);
const mockHost = jest.fn((_props: ComposerHost) => undefined);
const mockMenu = jest.fn((_promise: void | Promise<void>) => undefined);

function MockList({
  ref,
  ...props
}: MessageListViewProps & { ref?: Ref<MessageListViewMethods> }) {
  useImperativeHandle(ref, () => ({
    scrollToLatest: () => Promise.resolve(),
    scrollToRow: () => Promise.resolve(),
    landLift: mockLand,
  }));
  mockList(props);
  return <View />;
}
function MockHost(props: ComposerHost & { children: ReactNode }) {
  mockHost(props);
  return <View>{props.children}</View>;
}
jest.mock("~/features/native-list/native", () => ({
  MessageListView: (props: Parameters<typeof MockList>[0]) => (
    <MockList {...props} />
  ),
  MessageListComposer: (props: Parameters<typeof MockHost>[0]) => (
    <MockHost {...props} />
  ),
  nativeSupport: { features: ["composerLayout", "liftHandoff"] },
}));
jest.mock("~/features/native-list/menu-keyboard-hold", () => ({
  useMenuKeyboardHold: () => ({
    frozen: true,
    hold: jest.fn(),
    menuKeyboard: { onClosing: jest.fn(), onClosed: jest.fn() },
  }),
}));
function MockDevMenu({
  controls,
  onClosing,
}: {
  controls: (close: () => void) => ReactNode;
  onClosing: () => void | Promise<void>;
}) {
  function close() {
    mockMenu(onClosing());
  }
  return (
    <View>
      {controls(close)}
      <Pressable onPress={close}>
        <Text>Close menu</Text>
      </Pressable>
    </View>
  );
}
jest.mock("~/features/native-list/dev-menu", () => ({
  DevMenu: (props: Parameters<typeof MockDevMenu>[0]) => (
    <MockDevMenu {...props} />
  ),
}));

beforeEach(() => {
  mockList.mockClear();
  mockHost.mockClear();
  mockMenu.mockClear();
  mockLand.mockClear();
});

async function holdRow() {
  const view = await render(<DevComposerLayout />);
  const hold = {
    rowId: "m0",
    part: "message",
    frame: { x: 60, y: 300, width: 200, height: 60 },
  } satisfies DevHold;
  await act(() =>
    mockList.mock.lastCall?.[0].onEvent({
      nativeEvent: { ...hold, type: "hold" },
    }),
  );
  return view;
}

test("close-before-worker publishes pair and declarative close together, then attaches handback waiter after layout", async () => {
  const view = await holdRow();
  const before = mockList.mock.lastCall?.[0];
  expect(before?.lift).toBeDefined();
  await fireEvent.press(view.getByText("Release pair and close"));
  const next = mockList.mock.lastCall?.[0];
  expect(next).toMatchObject({
    composer: { release: 1 },
    insets: { bottom: 104 },
    keyboardFrozen: true,
  });
  expect(mockHost.mock.lastCall?.[0].sequence).toBe(1);
  expect(next?.rows).not.toBe(before?.rows);
  expect(next?.lift).toBeUndefined();
  expect(mockLand).not.toHaveBeenCalled();
  await fireEvent(view.getByTestId("dev-composer-bar"), "layout");
  expect(mockLand).toHaveBeenCalledTimes(1);
  await expect(mockMenu.mock.lastCall?.[0]).resolves.toBeUndefined();
});

test("release-while-open retains real lift until the later close request", async () => {
  const view = await holdRow();
  await fireEvent.press(view.getByText("Release pair, keep menu"));
  expect(mockList.mock.lastCall?.[0].composer?.release).toBe(1);
  expect(mockList.mock.lastCall?.[0].lift).toBeDefined();
  expect(mockLand).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("Close menu"));
  expect(mockList.mock.lastCall?.[0].lift).toBeUndefined();
  expect(mockLand).toHaveBeenCalledTimes(1);
});
