import type { RefObject } from "react";
import type { SharedValue } from "react-native-reanimated";
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { MessageListViewMethods } from "./native";
import type { InsetState } from "./send-inset-state";
import type { ComposerHeight } from "~/features/conversation/composer-height";
import { markSendState } from "~/features/dev/send-timing";
import { outgoingExists } from "~/features/messaging/outbox";
import { composerBinding } from "./composer-binding";
import {
  heldMessages,
  initialInset,
  insetFor,
  sendReady,
} from "./send-inset-state";
import { useSendLatest } from "./send-latest";

/** Per-send committed layout, never a timer or a network acknowledgement. */
export function useComposerInset<T extends { readonly id: string }>(
  { bar, live, sendCommit, laidOut }: ComposerHeight,
  messages: readonly T[],
  {
    frozen,
    view,
    freeze,
  }: {
    frozen: boolean;
    view: RefObject<MessageListViewMethods | null>;
    freeze: SharedValue<boolean>;
  },
) {
  const send = useSyncExternalStore(sendCommit.subscribe, sendCommit.read);
  const ids = messages.map((message) => message.id);
  const [state, setState] = useState<InsetState>(() =>
    initialInset(send, ids, laidOut ?? 0),
  );
  const paused = frozen || send.layout?.frozen === true;
  const next = insetFor(state, send, ids, frozen);
  if (next !== state) setState(next);
  const ready = !paused && sendReady(send, ids);
  useSendLatest({
    view,
    commit: sendCommit,
    send,
    ready,
    waiting: next.pending !== undefined,
    freeze,
  });

  function committedHeight() {
    const host = bar.current;
    return host === null ? undefined : host.getBoundingClientRect().height;
  }
  function onHeight() {
    const height = committedHeight();
    if (height === undefined) return;
    sendCommit.observeLayout(height);
  }
  useAnimatedReaction(
    () => live.get(),
    (now, before) => {
      if (before !== null && now !== before) scheduleOnRN(onHeight);
    },
  );

  useLayoutEffect(() => {
    if (
      next.pending !== undefined &&
      send.messageId !== undefined &&
      !ids.includes(send.messageId) &&
      !outgoingExists(send.messageId)
    ) {
      sendCommit.cancel(send.sequence);
    }
    const height = committedHeight();
    if (height === undefined) return;
    sendCommit.observeLayout(height, frozen);
  });
  useLayoutEffect(() => {
    if (send.sequence === 0) return;
    markSendState(
      next.pending === undefined
        ? "rows/inset props released"
        : "rows/inset held",
      sendCommit.owner,
      {
        ...send,
        height: next.height,
      },
      next.released,
    );
    if (next.pending === undefined && send.height !== undefined) {
      sendCommit.published(send.sequence);
    }
  });

  return {
    inset: next.height,
    binding: composerBinding(sendCommit.owner, next.released),
    messages: heldMessages(next, messages),
    waiting: next.pending !== undefined,
    ready,
  };
}
