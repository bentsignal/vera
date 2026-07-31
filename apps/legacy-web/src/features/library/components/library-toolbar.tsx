import {
  LayoutGrid as GridIcon,
  ListChecks,
  List as ListIcon,
  ArrowDownWideNarrow as SortIcon,
} from "lucide-react";

import type { LibrarySort, LibraryView } from "@acme/features/library";
import { useLibraryStore } from "@acme/features/library";
import { Button } from "@acme/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { Input } from "@acme/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@acme/ui/tooltip";

import { cn } from "~/lib/utils";

export function LibraryToolbar({
  view,
  setView,
  setSort,
  setSortDirection,
  setSearchTerm,
}: {
  view: LibraryView;
  setView: (value: LibraryView) => void;
  setSort: (value: LibrarySort) => void;
  setSortDirection: (value: "asc" | "desc") => void;
  setSearchTerm: (value: string) => void;
}) {
  return (
    <div className="flex w-full justify-between gap-2 p-4">
      <Input
        placeholder="Search"
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <ToggleViewButton view={view} setView={setView} />
        <SelectFilesButton />
        <SortButton setSort={setSort} setSortDirection={setSortDirection} />
      </div>
    </div>
  );
}

function ToggleViewButton({
  view,
  setView,
}: {
  view: LibraryView;
  setView: (value: LibraryView) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setView(view === "grid" ? "list" : "grid")}
        >
          {view === "list" ? (
            <GridIcon className="h-4 w-4" />
          ) : (
            <ListIcon className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {view === "list" ? "Switch to grid view" : "Switch to list view"}
      </TooltipContent>
    </Tooltip>
  );
}

function SelectFilesButton() {
  const libraryMode = useLibraryStore((state) => state.libraryMode);
  const setLibraryMode = useLibraryStore((state) => state.setLibraryMode);
  const setSelectedFiles = useLibraryStore((state) => state.setSelectedFiles);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setSelectedFiles([]);
            setLibraryMode(libraryMode === "select" ? "default" : "select");
          }}
        >
          <ListChecks
            className={cn(
              "h-4 w-4 transition-colors",
              libraryMode === "select" ? "text-blue-400" : "text-primary",
            )}
            onClick={() =>
              libraryMode === "select"
                ? setLibraryMode("default")
                : setLibraryMode("select")
            }
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Select files</TooltipContent>
    </Tooltip>
  );
}

function SortButton({
  setSort,
  setSortDirection,
}: {
  setSort: (value: LibrarySort) => void;
  setSortDirection: (value: "asc" | "desc") => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <SortIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Sort</TooltipContent>
      </Tooltip>
      <DropdownMenuContent>
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Date</DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => {
                  setSort("date");
                  setSortDirection("desc");
                }}
              >
                Newest
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSort("date");
                  setSortDirection("asc");
                }}
              >
                Oldest
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
