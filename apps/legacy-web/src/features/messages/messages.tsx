import type { Ref } from "react";
import { useRef } from "react";

import "@/features/messages/styles/github-dark.min.css";
import "@/features/messages/styles/message-styles.css";

import type { MyUIMessage } from "@acme/features/messages";

import { UsageChatCallout } from "~/features/billing/components/usage-chat-callout";
import { useLoadMoreOnScroll } from "~/hooks/use-load-more-on-scroll";
import { ThreadFollowUps } from "../thread/components/thread-follow-ups";
import { Message } from "./components/message";
import {
  useDisplayedMessages,
  useLoadMorePreservation,
  useMessageListVisibility,
  useSendTimeScroll,
} from "./hooks/use-message-list";

const AT_END_THRESHOLD_PX = 2000;
const LOAD_MORE_THRESHOLD_PX = 1500;

export function Messages({
  threadId,
  isThreadIdle,
  ref,
  onIsAtEndChange,
}: {
  threadId: string;
  isThreadIdle: boolean;
  ref?: Ref<HTMLDivElement>;
  onIsAtEndChange: (atEnd: boolean) => void;
}) {
  const { messages, waiting, canLoadMore, status, loadMore } =
    useDisplayedMessages({
      threadId,
      isThreadIdle,
    });
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = useMessageListVisibility({
    scrollRef,
    messageCount: messages.length,
  });
  useSendTimeScroll({
    scrollRef,
    isThreadIdle,
    messageCount: messages.length,
    visible,
  });
  const { beginLoadMore } = useLoadMorePreservation({
    scrollRef,
    messageCount: messages.length,
  });

  function handleLoadMore() {
    if (!canLoadMore) return;
    beginLoadMore();
    loadMore();
  }

  useLoadMoreOnScroll({
    scrollRef,
    edge: "top",
    threshold: LOAD_MORE_THRESHOLD_PX,
    status,
    loadMore: handleLoadMore,
    // Wait until the bootstrap scroll-to-bottom has landed so we don't fire
    // loadMore while the viewport is momentarily parked at the top.
    enabled: visible,
  });

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const distanceFromEnd =
      element.scrollHeight - (element.scrollTop + element.clientHeight);
    onIsAtEndChange(distanceFromEnd <= AT_END_THRESHOLD_PX);
  }

  function setCombinedRef(node: HTMLDivElement | null) {
    scrollRef.current = node;
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  }

  return (
    <div
      ref={setCombinedRef}
      onScroll={onScroll}
      className="messages-scroll w-full flex-1 overflow-y-auto"
      style={{
        minHeight: 0,
        opacity: visible ? 1 : 0,
        transition: "opacity 300ms ease",
      }}
    >
      <div style={{ height: 96 }} />
      <div className="mx-auto flex w-full max-w-4xl flex-col px-8">
        {messages.map((item, index) => {
          const isLast = index === messages.length - 1;
          const isStreaming = isLast && !isThreadIdle;
          return (
            <div
              key={keyFor(item, isLast, isThreadIdle)}
              className={isLast ? "pb-6" : "pb-16"}
            >
              <Message message={item} isActive={isStreaming} isLast={isLast} />
            </div>
          );
        })}
      </div>
      <MessagesFooter
        waiting={waiting}
        isThreadIdle={isThreadIdle}
        threadId={threadId}
      />
    </div>
  );
}

function keyFor(item: MyUIMessage, isLast: boolean, isThreadIdle: boolean) {
  const isStreaming = isLast && !isThreadIdle;
  return isStreaming ? "last-streaming-message" : item.id;
}

function MessagesFooter({
  waiting,
  isThreadIdle,
  threadId,
}: {
  waiting: boolean;
  isThreadIdle: boolean;
  threadId: string;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-8 pb-32">
      <div style={{ minHeight: "50vh" }}>
        {isThreadIdle && (
          <>
            <UsageChatCallout />
            {!waiting && <ThreadFollowUps threadId={threadId} />}
          </>
        )}
      </div>
    </div>
  );
}
