import type { RefObject } from "react";
import type { SharedValue } from "react-native-reanimated";
import { useLayoutEffect } from "react";
import { Alert } from "react-native";

import type { MessageListViewMethods } from "./native";
import type {
  SendCommit,
  SendCommitStore,
} from "~/features/conversation/send-commit";
import { markSendState } from "~/features/dev/send-timing";

/** Arm generic smooth latest navigation before publishing a ready send pair. */
export function useSendLatest({
  view,
  commit,
  send,
  ready,
  waiting,
  freeze,
}: {
  view: RefObject<MessageListViewMethods | null>;
  commit: SendCommitStore;
  send: SendCommit;
  ready: boolean;
  waiting: boolean;
  freeze: SharedValue<boolean>;
}) {
  const { sequence, latestRequested, latestArmed, cancelled } = send;
  useLayoutEffect(() => {
    markSendState(
      `latest gate ready=${ready} waiting=${waiting} requested=${latestRequested} armed=${latestArmed} cancelled=${cancelled} view=${view.current !== null} freeze=${freeze.get()}`,
      commit.owner,
      commit.read(),
    );
    if (!ready || !waiting || !latestRequested || latestArmed || cancelled)
      return undefined;
    const list = view.current;
    if (list === null || freeze.get()) return undefined;
    let active = true;
    markSendState("latest command called", commit.owner, commit.read());
    void list
      .scrollToLatest(true)
      .then(() => {
        markSendState(
          `latest command resolved active=${active} sameView=${view.current === list} freeze=${freeze.get()}`,
          commit.owner,
          commit.read(),
        );
        if (!active || view.current !== list || freeze.get()) return;
        commit.armLatest(sequence);
      })
      .catch(() => {
        markSendState(
          `latest command rejected active=${active} sameView=${view.current === list}`,
          commit.owner,
          commit.read(),
        );
        if (!active || view.current !== list) return;
        commit.failLatest(sequence);
        Alert.alert("Couldn't scroll to the newest message");
      });
    return () => {
      markSendState(
        "latest command effect cleaned",
        commit.owner,
        commit.read(),
      );
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
