import { useRef } from "react";
import { QuickLink } from "@/features/quick-link/quick-link";
import { Cog } from "lucide-react";

import { shortcuts } from "@acme/features/shortcuts";
import { useThreadList } from "@acme/features/thread";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
} from "@acme/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@acme/ui/tooltip";

import { LibraryButton } from "~/features/library/components/library-trigger-button";
import { useShortcut } from "~/features/shortcuts/hooks/use-shortcut";
import { NewThreadButton } from "~/features/thread/components/new-thread-button";
import { ThreadDeleteModal } from "~/features/thread/components/thread-delete-modal";
import { ThreadList } from "~/features/thread/components/thread-list";
import { ThreadRenameModal } from "~/features/thread/components/thread-rename-modal";

export function ChatSidebar() {
  const searchRef = useRef<HTMLInputElement>(null);

  const { threads, setSearch, loadMoreThreads, status } = useThreadList();

  useShortcut({
    hotkey: shortcuts.search.hotkey,
    callback: () => {
      if (searchRef.current) {
        searchRef.current.focus();
      }
    },
  });

  const loadingFirstPage = status === "LoadingFirstPage";
  const noThreads = threads.length === 0 && !loadingFirstPage;

  return (
    <Sidebar variant="floating" className="py-4 pr-0 pl-4 select-none">
      <SidebarHeader className="md:px-auto flex flex-row items-center justify-between px-4 pt-4 md:pt-4">
        <Input
          placeholder="Search"
          className="w-full"
          onChange={(e) => setSearch(e.target.value)}
          ref={searchRef}
        />
        <SettingsButton />
        <LibraryButton />
        <NewThreadButton />
      </SidebarHeader>
      <SidebarContent className="flex min-h-0 flex-1 flex-col overflow-hidden mask-b-from-95%">
        <SidebarMenu className="flex min-h-0 flex-1 flex-col">
          <ThreadList
            threads={threads}
            status={status}
            loadMore={loadMoreThreads}
            noThreads={noThreads}
          />
        </SidebarMenu>
        <ThreadDeleteModal />
        <ThreadRenameModal />
      </SidebarContent>
    </Sidebar>
  );
}

function SettingsButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <QuickLink to="/settings/preferences" preload="render">
          <Button variant="outline" size="icon">
            <Cog className="h-4 w-4" />
          </Button>
        </QuickLink>
      </TooltipTrigger>
      <TooltipContent>Settings</TooltipContent>
    </Tooltip>
  );
}
