import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import type { ComposerHost } from "~/features/native-list/contract";
import { useComposerCommit } from "~/features/conversation/composer-commit";
import { createSendCommit } from "~/features/conversation/send-commit";
import { composerBinding } from "~/features/native-list/composer-binding";
import { ComposerLayout } from "~/features/native-list/composer-layout";

const mockHost = jest.fn((props: ComposerHost & { children: ReactNode }) => (
  <View testID="native-composer">{props.children}</View>
));
let mockSupported = true;
jest.mock("~/features/native-list/native", () => ({
  get MessageListComposer() {
    return mockSupported ? mockHost : null;
  },
}));

beforeEach(() => {
  mockSupported = true;
  mockHost.mockClear();
});

test("the native binding explicitly transports the shared gap once", () => {
  expect(composerBinding("owner", 4)).toEqual({
    owner: "owner",
    release: 4,
    gap: 8,
  });
  mockSupported = false;
  expect(composerBinding("owner", 4)).toBeUndefined();
});

test("an old binary keeps the original bar without a native host", async () => {
  mockSupported = false;
  const view = await render(
    <ComposerLayout owner="owner" sequence={0}>
      <Text>Existing bar</Text>
    </ComposerLayout>,
  );
  expect(view.getByText("Existing bar")).toBeTruthy();
  expect(view.queryByTestId("native-composer")).toBeNull();
  expect(mockHost).not.toHaveBeenCalled();
});

test("child-local clear uses the current store snapshot even with stale parent sends", async () => {
  const commit = createSendCommit("same-composer");
  const report = {
    sendCommit: commit,
    bar: {
      current: { getBoundingClientRect: () => ({ height: 76 }) },
    },
    sends: 0,
  };
  function Composer() {
    const [draft, setDraft] = useState({ clear: 0, text: "Eight lines" });
    const current = useComposerCommit(report, draft.clear, []);
    return (
      <>
        <ComposerLayout owner={commit.owner} sequence={current.sequence}>
          <Text testID="draft">{draft.text}</Text>
        </ComposerLayout>
        <Pressable
          onPress={() => {
            const sequence = commit.begin(draft.clear + 1, []);
            commit.expect(sequence, "own-row");
            setDraft({ clear: draft.clear + 1, text: "" });
          }}
        >
          <Text>Send</Text>
        </Pressable>
      </>
    );
  }
  const view = await render(<Composer />);
  await fireEvent.press(view.getByText("Send"));
  expect(report.sends).toBe(0);
  expect(view.getByTestId("draft").props.children).toBe("");
  expect(mockHost.mock.lastCall?.[0]).toMatchObject({
    owner: commit.owner,
    sequence: 1,
  });
  expect(commit.read().height).toBe(76);
});
