import type { RefObject } from "react";
import type { SharedValue } from "react-native-reanimated";
import { useLayoutEffect } from "react";
import { Alert } from "react-native";

import type { MessageListViewMethods } from "./native";
import type { SendCommitStore } from "~/features/conversation/send-commit";

/** Arm generic smooth latest navigation before publishing a ready send pair. */
export function useSendLatest({
  view,
  commit,
  ready,
  waiting,
  freeze,
}: {
  view: RefObject<MessageListViewMethods | null>;
  commit: SendCommitStore;
  ready: boolean;
  waiting: boolean;
  freeze: SharedValue<boolean>;
}) {
  const { sequence, latestRequested, latestArmed, cancelled } = commit.read();
  useLayoutEffect(() => {
    if (!ready || !waiting || !latestRequested || latestArmed || cancelled)
      return undefined;
    const list = view.current;
    if (list === null || freeze.get()) return undefined;
    let active = true;
    void list
      .scrollToLatest(true)
      .then(() => {
        if (!active || view.current !== list || freeze.get()) return;
        commit.armLatest(sequence);
      })
      .catch(() => {
        if (!active || view.current !== list) return;
        commit.failLatest(sequence);
        Alert.alert("Couldn't scroll to the newest message");
      });
    return () => {
      active = false;
    };
  }, [
    ready,
    waiting,
    latestRequested,
    latestArmed,
    cancelled,
    sequence,
    view,
    commit,
    freeze,
  ]);
}
