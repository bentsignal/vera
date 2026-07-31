import { useEffect, useRef, useState } from "react";
// eslint-disable-next-line no-restricted-imports -- non-suspending useQuery so the thread view reacts to state flips without a suspense boundary while a response streams
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import { threadQueries, useThreadStore } from "@acme/features/thread";
import { Button } from "@acme/ui/button";

import "@/features/messages/styles/github-dark.min.css";
import "@/features/messages/styles/message-styles.css";

import { Abyss } from "~/components/abyss";
import { Messages } from "~/features/messages/messages";
import { ThreadTitleUpdater } from "./components/thread-title-updater";

function useThread(threadId: string) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const setActiveThread = useThreadStore((state) => state.setActiveThread);
  // eslint-disable-next-line no-restricted-syntax -- Syncs active thread ID with the thread store on mount/unmount
  useEffect(() => {
    setActiveThread(threadId);
    return () => {
      setActiveThread(null);
    };
  }, [threadId, setActiveThread]);

  // thread is idle when no in-flight event exists for it
  const { data: isThreadIdle = false } = useQuery({
    ...threadQueries.state(threadId),
    select: (latestEvent) => latestEvent === null,
  });

  return {
    scrollRef,
    isThreadIdle,
    isAtBottom,
    setIsAtBottom,
  };
}

export function Thread({ threadId }: { threadId: string }) {
  const { scrollRef, isThreadIdle, isAtBottom, setIsAtBottom } =
    useThread(threadId);

  function scrollToBottom() {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: "smooth",
    });
  }

  return (
    <div className="relative flex h-full w-full flex-1 flex-col items-center justify-start">
      <ThreadTitleUpdater threadId={threadId} />
      <Abyss />
      <Messages
        ref={scrollRef}
        threadId={threadId}
        isThreadIdle={isThreadIdle}
        onIsAtEndChange={setIsAtBottom}
      />
      {!isAtBottom && (
        <div className="absolute right-0 bottom-36 z-10 flex w-full items-center justify-center rounded-full p-0 sm:bottom-24">
          <Button
            onClick={scrollToBottom}
            className="font-semibold shadow-lg"
            variant="default"
          >
            Scroll to bottom <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
