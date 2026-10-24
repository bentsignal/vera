import { useRef, useSyncExternalStore } from "react";
import { useSharedValue } from "react-native-reanimated";
import { act, render } from "@testing-library/react-native";

import type { SendCommitStore } from "~/features/conversation/send-commit";
import type { MessageListViewMethods } from "~/features/native-list/native";
import { createSendCommit } from "~/features/conversation/send-commit";
import { useSendLatest } from "~/features/native-list/send-latest";

jest.mock("~/features/dev/send-timing", () => ({ markSendState: jest.fn() }));

const mockLatest = jest.fn(() => Promise.resolve());

/** This runs through the app's React Compiler, with a stable external store. */
function SendLatest({ commit }: { commit: SendCommitStore }) {
  const send = useSyncExternalStore(commit.subscribe, commit.read);
  const view = useRef<MessageListViewMethods>({
    scrollToLatest: mockLatest,
    scrollToRow: () => Promise.resolve(),
  });
  const freeze = useSharedValue(false);
  useSendLatest({
    view,
    commit,
    send,
    ready: send.height !== undefined,
    waiting: send.published !== true,
    freeze,
  });
  return null;
}

beforeEach(() => mockLatest.mockClear());

test("a later external-store request arms after the actual ACK", async () => {
  const commit = createSendCommit();
  await render(<SendLatest commit={commit} />);
  await act(() => {
    const sequence = commit.begin(1, []);
    commit.requestLatest();
    commit.expect(sequence, "own-row");
  });
  expect(mockLatest).not.toHaveBeenCalled();
  await act(async () => {
    commit.acknowledge(1, 76);
    await Promise.resolve();
  });
  expect(mockLatest).toHaveBeenCalledTimes(1);
  expect(mockLatest).toHaveBeenCalledWith(true);
  expect(commit.read().latestArmed).toBe(true);
});
