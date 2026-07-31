import type { RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { MyUIMessage } from "@acme/features/messages";
import {
  PAGE_SIZE,
  responseHasNoContent,
  useMessages,
} from "@acme/features/messages";

const GHOST_ASSISTANT_ID = "__ghost_assistant__";

function makeGhostAssistant(order: number) {
  return {
    id: GHOST_ASSISTANT_ID,
    key: `ghost-${order}`,
    order,
    stepOrder: 0,
    status: "pending",
    role: "assistant",
    text: "",
    parts: [],
    _creationTime: Date.now(),
  } as const satisfies MyUIMessage;
}

export function useDisplayedMessages({
  threadId,
  isThreadIdle,
}: {
  threadId: string;
  isThreadIdle: boolean;
}) {
  const {
    messages: pureMessages,
    loadMore,
    status,
  } = useMessages({
    threadId,
    streaming: true,
  });

  const realMessages = pureMessages.filter((item) => item.role !== "system");
  const lastRealMessage = realMessages[realMessages.length - 1];
  const waiting =
    realMessages.length > 0 &&
    lastRealMessage !== undefined &&
    (lastRealMessage.role === "user" || responseHasNoContent(lastRealMessage));

  const needsGhostAssistant =
    waiting && lastRealMessage.role === "user" && !isThreadIdle;
  const messages = needsGhostAssistant
    ? [...realMessages, makeGhostAssistant(lastRealMessage.order + 1)]
    : realMessages;

  return {
    messages,
    waiting,
    canLoadMore: status === "CanLoadMore",
    status,
    loadMore: () => loadMore(PAGE_SIZE),
  };
}

export function useMessageListVisibility({
  scrollRef,
  messageCount,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  messageCount: number;
}) {
  const [visible, setVisible] = useState(false);
  const hasBootstrappedRef = useRef(false);

  // eslint-disable-next-line no-restricted-syntax -- Effect needed to perform initial bottom scroll before fade-in
  useEffect(() => {
    if (hasBootstrappedRef.current || messageCount === 0) return;

    hasBootstrappedRef.current = true;
    requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) {
        element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
      }
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, [messageCount, scrollRef]);

  return visible;
}

export function useSendTimeScroll({
  scrollRef,
  isThreadIdle,
  messageCount,
  visible,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  isThreadIdle: boolean;
  messageCount: number;
  visible: boolean;
}) {
  const prevIsThreadIdleRef = useRef(isThreadIdle);
  const prevMessageCountRef = useRef(messageCount);

  // eslint-disable-next-line no-restricted-syntax -- Effect needed to detect send events and trigger smooth DOM scroll
  useEffect(() => {
    const wasIdle = prevIsThreadIdleRef.current;
    const nowGenerating = !isThreadIdle;
    const messageCountIncreased = messageCount > prevMessageCountRef.current;

    prevIsThreadIdleRef.current = isThreadIdle;
    prevMessageCountRef.current = messageCount;

    if (!visible) return;
    if (!wasIdle || !nowGenerating || !messageCountIncreased) return;

    requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (!element) return;
      element.scrollTo({
        top: element.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [isThreadIdle, messageCount, visible, scrollRef]);
}

export function useLoadMorePreservation({
  scrollRef,
  messageCount,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  messageCount: number;
}) {
  const pendingHeightRef = useRef<number | null>(null);

  function beginLoadMore() {
    const element = scrollRef.current;
    if (!element) return;
    pendingHeightRef.current = element.scrollHeight;
  }

  // Add the height delta to the *current* scrollTop (not a pre-fetch snapshot)
  // so any scrolling the user did while the page was in flight is preserved.
  useLayoutEffect(() => {
    const previousHeight = pendingHeightRef.current;
    if (previousHeight == null) return;
    const element = scrollRef.current;
    if (!element) return;
    const delta = element.scrollHeight - previousHeight;
    if (delta > 0) {
      element.scrollTo({ top: element.scrollTop + delta, behavior: "auto" });
      pendingHeightRef.current = null;
    }
  }, [messageCount, scrollRef]);

  return { beginLoadMore };
}
