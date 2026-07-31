import { Activity, useEffect, useRef, useState } from "react";
import { usePaginatedQuery } from "convex/react";

import type {
  LibraryFile,
  LibraryMode,
  LibrarySort,
  LibraryTab,
  LibraryView,
} from "@acme/features/library";
import { api } from "@acme/db/api";
import { libraryPagination, useLibraryStore } from "@acme/features/library";
import { ContextMenu, ContextMenuTrigger } from "@acme/ui/context-menu";
import { Loader } from "@acme/ui/loader";

import { useLoadMoreOnScroll } from "~/hooks/use-load-more-on-scroll";
import { useScreenSize } from "~/hooks/use-screen-size";
import { LibraryGridFile, LibraryListFile } from "./library-file";
import { LibraryFileContextItems } from "./library-file-context-items";

type PaginatedStatus =
  | "LoadingFirstPage"
  | "LoadingMore"
  | "CanLoadMore"
  | "Exhausted";

const LOAD_MORE_THRESHOLD_PX = 800;

function useGridColumnCount() {
  const screenSize = useScreenSize();
  if (screenSize === "mobile") return 1;
  if (screenSize === "tablet") return 3;
  return 4;
}

function useDelayedVisibility() {
  const [visible, setVisible] = useState(false);
  // eslint-disable-next-line no-restricted-syntax -- flip opacity on mount so the list fades in after layout settles; the fade replaces the LegendList `onLoad` signal we used to get
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return visible;
}

interface FileListViewProps {
  files: LibraryFile[];
  status: PaginatedStatus;
  loadMore: (numItems: number) => void;
  libraryMode: LibraryMode;
  selectedFiles: LibraryFile[];
}

function GridFileList({
  files,
  status,
  loadMore,
  libraryMode,
  selectedFiles,
}: FileListViewProps) {
  const numColumns = useGridColumnCount();
  const visible = useDelayedVisibility();
  const scrollRef = useRef<HTMLDivElement>(null);

  useLoadMoreOnScroll({
    scrollRef,
    edge: "bottom",
    threshold: LOAD_MORE_THRESHOLD_PX,
    status,
    loadMore: () => loadMore(libraryPagination.pageSize),
  });

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto"
      style={{
        minHeight: 0,
        opacity: visible ? 1 : 0,
        transition: "opacity 300ms ease",
      }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`,
        }}
      >
        {files.map((file) => (
          <div key={`${numColumns}-${file.id}`} className="p-2">
            <LibraryGridFile
              file={file}
              mode={libraryMode}
              selected={selectedFiles.some((f) => f.id === file.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ListFileList({
  files,
  status,
  loadMore,
  libraryMode,
  selectedFiles,
}: FileListViewProps) {
  const visible = useDelayedVisibility();
  const scrollRef = useRef<HTMLDivElement>(null);

  useLoadMoreOnScroll({
    scrollRef,
    edge: "bottom",
    threshold: LOAD_MORE_THRESHOLD_PX,
    status,
    loadMore: () => loadMore(libraryPagination.pageSize),
  });

  return (
    <div
      ref={scrollRef}
      className="flex flex-1 flex-col overflow-y-auto"
      style={{
        minHeight: 0,
        opacity: visible ? 1 : 0,
        transition: "opacity 300ms ease",
      }}
    >
      {files.map((file) => (
        <div key={file.id} className="py-1">
          <LibraryListFile
            file={file}
            mode={libraryMode}
            selected={selectedFiles.some((f) => f.id === file.id)}
          />
        </div>
      ))}
    </div>
  );
}

export function LibraryFileList({
  view,
  sort,
  sortDirection,
  searchTerm,
  tab,
}: {
  view: LibraryView;
  sort: LibrarySort;
  sortDirection: "asc" | "desc";
  searchTerm: string;
  tab: LibraryTab;
}) {
  const {
    results: files,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.app.library.getUserFiles,
    {
      direction: sortDirection,
      tab,
      sort,
      searchTerm: searchTerm.trim().length > 0 ? searchTerm : undefined,
    },
    {
      initialNumItems: libraryPagination.initialSize,
    },
  );

  const libraryMode = useLibraryStore((state) => state.libraryMode);
  const selectedFiles = useLibraryStore((state) => state.selectedFiles);

  if (status === "LoadingFirstPage") {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader size="sm" variant="dots" />
      </div>
    );
  }

  if (status === "Exhausted" && files.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p>No files found</p>
      </div>
    );
  }

  const viewProps = {
    files,
    status,
    loadMore,
    libraryMode,
    selectedFiles,
  } satisfies FileListViewProps;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">
        <Activity mode={view === "grid" ? "visible" : "hidden"}>
          <GridFileList {...viewProps} />
        </Activity>
        <Activity mode={view === "list" ? "visible" : "hidden"}>
          <ListFileList {...viewProps} />
        </Activity>
      </ContextMenuTrigger>
      <LibraryFileContextItems />
    </ContextMenu>
  );
}
