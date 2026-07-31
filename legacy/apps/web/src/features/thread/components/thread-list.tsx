import type { PaginationStatus } from "convex/react";
import { useRef } from "react";
import { useLocation } from "@tanstack/react-router";

import type { PureThread } from "@acme/features/thread";
import { ContextMenu, ContextMenuTrigger } from "@acme/ui/context-menu";

import { useLoadMoreOnScroll } from "~/hooks/use-load-more-on-scroll";
import { ThreadListContextItems } from "./thread-list-context-items";
import { ThreadListItem } from "./thread-list-item";

const LOAD_MORE_THRESHOLD_PX = 2000;

export function ThreadList({
  threads,
  status,
  loadMore,
  noThreads,
}: {
  threads: PureThread[];
  status: PaginationStatus;
  loadMore: () => void;
  noThreads: boolean;
}) {
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useLoadMoreOnScroll({
    scrollRef,
    edge: "bottom",
    threshold: LOAD_MORE_THRESHOLD_PX,
    status,
    loadMore,
  });

  if (noThreads) {
    return (
      <div className="flex w-full items-center justify-center py-4">
        <p className="text-muted-foreground text-sm">No threads found</p>
      </div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-1.5 pb-2"
      >
        {threads.map((item) => {
          const active =
            pathname.includes(item.id) ||
            (item.clientId !== undefined && pathname.includes(item.clientId));
          return (
            <div key={item.id} className="pb-0.5">
              <ThreadListItem
                thread={{
                  title: item.title,
                  id: item.id,
                  active,
                  latestEvent: item.latestEvent,
                  pinned: item.pinned === true,
                }}
              />
            </div>
          );
        })}
      </ContextMenuTrigger>
      <ThreadListContextItems />
    </ContextMenu>
  );
}
