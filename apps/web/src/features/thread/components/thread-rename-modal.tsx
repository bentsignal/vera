import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useThreadMutations, useThreadStore } from "@acme/features/thread";
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

export function ThreadRenameModal() {
  const renameModalOpen = useThreadStore((state) => state.renameModalOpen);
  const hoveredThread = useThreadStore((state) => state.hoveredThread);
  const setRenameModalOpen = useThreadStore(
    (state) => state.setRenameModalOpen,
  );

  const threadMutations = useThreadMutations();
  const { mutate: renameThread } = useMutation({
    ...threadMutations.rename,
    onError: (error) => {
      console.error(error);
      toast.error("Failed to rename thread");
    },
  });

  const [newThreadName, setNewThreadName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={renameModalOpen}
      onOpenChange={(open) => {
        if (open) {
          setNewThreadName(hoveredThread?.title ?? "");
        } else {
          setRenameModalOpen(false);
          setNewThreadName("");
        }
      }}
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
            if (!hoveredThread) return;
            renameThread({
              threadId: hoveredThread.id,
              name: newThreadName,
            });
            setRenameModalOpen(false);
            setNewThreadName("");
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename Thread</DialogTitle>
          </DialogHeader>
          <DialogDescription className="flex flex-col gap-2 py-4">
            <span className="text-muted-foreground">
              Enter a new name for the thread.
            </span>
            <Input
              ref={inputRef}
              value={newThreadName}
              onChange={(e) => setNewThreadName(e.target.value)}
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
