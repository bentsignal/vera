import { X } from "lucide-react";

import type { LibraryFile } from "@acme/features/library";
import { useComposerStore } from "@acme/features/composer";
import { getFileType } from "@acme/features/library";
import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@acme/ui/dialog";

import { Image } from "~/components/image";
import { LibraryFileIcon } from "~/features/library/components/library-file-icon";
import { useFileInteraction } from "~/features/library/hooks/use-file-interaction";
import { ComposerAddAttachments } from "./composer-add-attachments";

interface AttachmentRowProps {
  file: LibraryFile;
  onRemove: (id: LibraryFile["id"]) => void;
}

function AttachmentRow({ file, onRemove }: AttachmentRowProps) {
  const fileType = getFileType(file.mimeType);
  const { handleFileClick, handleFileHover } = useFileInteraction();
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div
        className="flex items-center gap-3 select-none hover:cursor-pointer"
        onClick={() => {
          handleFileClick(file, "default", false);
        }}
        onMouseEnter={() => {
          handleFileHover(file, "default");
        }}
      >
        <div className="flex h-8 w-8 items-center justify-center">
          {fileType === "image" ? (
            <Image
              src={file.url}
              alt={file.fileName}
              width={32}
              height={32}
              className="h-full w-full rounded object-cover"
            />
          ) : (
            <LibraryFileIcon fileType={fileType} className="h-5 w-5" />
          )}
        </div>
        <span className="line-clamp-1 text-sm font-medium">
          {file.fileName}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(file.id)}
        className="h-6 w-6 shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function ComposerAttachmentsList({
  children,
}: {
  children: React.ReactNode;
}) {
  const attachedFiles = useComposerStore((state) => state.attachedFiles);
  const removeAttachment = useComposerStore((state) => state.removeAttachment);
  const clearAttachments = useComposerStore((state) => state.clearAttachments);

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-card/50 max-w-md backdrop-blur-lg">
        <DialogHeader>
          <DialogTitle>Attachments</DialogTitle>
        </DialogHeader>
        {attachedFiles.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-muted-foreground text-sm">
              No files attached yet
            </p>
            <ComposerAddAttachments />
          </div>
        ) : (
          <>
            <div className="flex h-96 flex-col gap-2 overflow-y-auto pr-4">
              {attachedFiles.map((file) => (
                <AttachmentRow
                  key={file.id}
                  file={file}
                  onRemove={removeAttachment}
                />
              ))}
            </div>
            <div className="flex items-center justify-between border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAttachments}
                className="text-muted-foreground"
              >
                Clear all
              </Button>
              <ComposerAddAttachments />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const AttachmentsDialogTrigger = DialogTrigger;
