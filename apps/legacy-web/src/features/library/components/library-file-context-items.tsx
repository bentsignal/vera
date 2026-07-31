import { DownloadIcon, Pencil, Trash } from "lucide-react";

import { useLibraryStore } from "@acme/features/library";
import { ContextMenuContent, ContextMenuItem } from "@acme/ui/context-menu";

import { useFileInteraction } from "../hooks/use-file-interaction";

export function LibraryFileContextItems() {
  const setLibraryDeleteModalOpen = useLibraryStore(
    (state) => state.setLibraryDeleteModalOpen,
  );
  const setLibraryRenameModalOpen = useLibraryStore(
    (state) => state.setLibraryRenameModalOpen,
  );
  const { download } = useFileInteraction();
  return (
    <ContextMenuContent>
      <ContextMenuItem
        onClick={() => {
          const selectedFile = useLibraryStore.getState().selectedFile;
          if (!selectedFile) {
            return;
          }
          void download([selectedFile.url]);
        }}
      >
        <DownloadIcon className="h-4 w-4" />
        Download
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          setLibraryRenameModalOpen(true);
        }}
      >
        <Pencil className="h-4 w-4" />
        Rename
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          setLibraryDeleteModalOpen(true);
        }}
      >
        <Trash className="h-4 w-4" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
