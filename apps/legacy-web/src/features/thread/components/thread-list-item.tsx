// eslint-disable-next-line no-restricted-imports -- manual memo needed: deep-equal check prevents thread list item re-renders
import { memo } from "react";
import equal from "fast-deep-equal";
import { Brain, Pin } from "lucide-react";

import type { Thread } from "@acme/features/thread";
import { useThreadStore } from "@acme/features/thread";
import { useIsMobile } from "@acme/ui/hooks/use-mobile";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@acme/ui/sidebar";

import { QuickLink as Link } from "~/features/quick-link/quick-link";
import { cn } from "~/lib/utils";

function ThreadListItemImpl({ thread }: { thread: Thread }) {
  const isMobile = useIsMobile();
  const { toggleSidebar } = useSidebar();
  const setHoveredThread = useThreadStore((state) => state.setHoveredThread);

  return (
    <SidebarMenuItem
      key={thread.id}
      onMouseEnter={() => setHoveredThread(thread)}
      className="hover:bg-border transition-background-color w-full rounded-md duration-100"
    >
      <SidebarMenuButton
        asChild
        className="mask-r-from-75% py-5"
        onClick={() => {
          if (isMobile) {
            toggleSidebar();
          }
        }}
      >
        <Link
          to="/chat/$id"
          params={{ id: thread.id }}
          preload="intent"
          className={cn(
            "font-medium whitespace-nowrap",
            thread.active && "bg-border",
          )}
        >
          {
            <div className="flex items-center gap-2">
              {thread.pinned && (
                <Pin className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              )}
              {thread.latestEvent !== null && (
                <Brain className="text-muted-foreground h-4 w-4 animate-pulse" />
              )}
              {thread.title === "New Chat" ? (
                <span className="bg-muted-foreground/30 h-3 flex-1 animate-pulse rounded" />
              ) : (
                thread.title
              )}
            </div>
          }
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export const ThreadListItem = memo(ThreadListItemImpl, (prev, next) => {
  return equal(prev.thread, next.thread);
});
