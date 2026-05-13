import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useFileMutations, useLibraryStore } from "@acme/features/library";
import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import { Input } from "@acme/ui/input";

export function LibraryRenameModal() {
  const libraryRenameModalOpen = useLibraryStore(
    (state) => state.libraryRenameModalOpen,
  );
  const setLibraryRenameModalOpen = useLibraryStore(
    (state) => state.setLibraryRenameModalOpen,
  );

  const selectedFile = useLibraryStore((state) => state.selectedFile);

  const [newFileName, setNewFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const mutations = useFileMutations();
  const { mutate: renameFile } = useMutation({
    ...mutations.renameFile,
    onError: (error) => {
      console.error(error);
      toast.error("Failed to rename file");
    },
  });

  return (
    <Dialog
      open={libraryRenameModalOpen}
      onOpenChange={setLibraryRenameModalOpen}
    >
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!selectedFile) return;
            renameFile({ id: selectedFile.id, name: newFileName });
            setLibraryRenameModalOpen(false);
            setNewFileName("");
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
          </DialogHeader>
          <DialogDescription className="flex flex-col gap-2 py-4">
            <span className="text-muted-foreground">
              Enter a new name for the file.
            </span>
            <Input
              ref={inputRef}
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="Enter a new name..."
            />
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit">Rename</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
