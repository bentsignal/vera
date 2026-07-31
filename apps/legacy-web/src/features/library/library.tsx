import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  File as FileIcon,
  Image as ImageIcon,
  Library as LibraryIcon,
} from "lucide-react";

import type {
  LibrarySort,
  LibraryTab,
  LibraryView,
} from "@acme/features/library";
import { useDebouncedInput } from "@acme/features/hooks";
import { useLibraryStore } from "@acme/features/library";
import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";

import { cn } from "~/lib/utils";
import { LibraryBulkToolbar } from "./components/library-bulk-toolbar";
import { LibraryDeleteModal } from "./components/library-delete-modal";
import { LibraryFileList } from "./components/library-file-list";
import { LibraryPhotoViewer } from "./components/library-photo-viewer";
import { LibraryRenameModal } from "./components/library-rename-modal";
import { LibraryToolbar } from "./components/library-toolbar";
import { LibraryUpload } from "./components/library-upload";

const tabs = [
  {
    label: "All Files",
    value: "all",
    icon: LibraryIcon,
  },
  {
    label: "Images",
    value: "images",
    icon: ImageIcon,
  },
  {
    label: "Documents",
    value: "documents",
    icon: FileIcon,
  },
] satisfies { label: string; value: LibraryTab; icon: LucideIcon }[];

export function Library() {
  const libraryOpen = useLibraryStore((state) => state.libraryOpen);
  const setLibraryOpen = useLibraryStore((state) => state.setLibraryOpen);
  const setLibraryMode = useLibraryStore((state) => state.setLibraryMode);

  const firstTab = tabs[0];
  const [activeTab, setActiveTab] = useState<LibraryTab>(
    firstTab ? firstTab.value : "all",
  );
  const [view, setView] = useState<LibraryView>("grid");
  const [sort, setSort] = useState<LibrarySort>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const { setValue: setSearch, debouncedValue: searchTerm } =
    useDebouncedInput(500);

  return (
    <>
      <LibraryDeleteModal />
      <LibraryRenameModal />
      <LibraryPhotoViewer />
      <Dialog
        open={libraryOpen}
        onOpenChange={(open) => {
          setLibraryOpen(open);
          if (!open) {
            setLibraryMode("default");
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="h-full max-h-[600px] gap-0 border-none bg-transparent p-0 shadow-none supports-[backdrop-filter]:bg-transparent md:max-w-[700px] xl:max-w-[900px]"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Library</DialogTitle>
            <DialogDescription>
              Your library of files and documents.
            </DialogDescription>
          </DialogHeader>
          <div className="flex">
            <div className="bg-card supports-[backdrop-filter]:bg-card/50 flex h-full w-46 flex-col justify-between rounded-xl rounded-r-none border border-r-0 backdrop-blur-lg">
              <div className="flex flex-col gap-2 p-4">
                {tabs.map((tab) => (
                  <Button
                    key={tab.label}
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-2",
                      activeTab === tab.value &&
                        "bg-card supports-[backdrop-filter]:bg-card/50 text-primary",
                    )}
                    onClick={() => setActiveTab(tab.value)}
                  >
                    <tab.icon className="h-5 w-5" />
                    <span className="text-md font-semibold">{tab.label}</span>
                  </Button>
                ))}
              </div>
              <LibraryUpload />
            </div>
            <div className="bg-background supports-[backdrop-filter]:bg-background/50 relative flex h-full flex-1 flex-col rounded-xl rounded-l-none border border-l-0 backdrop-blur-lg">
              <LibraryToolbar
                view={view}
                setView={setView}
                setSort={setSort}
                setSortDirection={setSortDirection}
                setSearchTerm={setSearch}
              />
              <div className="flex max-h-[500px] min-h-[500px] flex-1 flex-col mask-b-from-95% px-4 pb-4">
                <LibraryFileList
                  view={view}
                  sort={sort}
                  sortDirection={sortDirection}
                  searchTerm={searchTerm}
                  tab={activeTab}
                />
              </div>
              <div className="pointer-events-none absolute right-0 bottom-0 left-0 flex w-full items-center justify-center">
                <LibraryBulkToolbar />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
