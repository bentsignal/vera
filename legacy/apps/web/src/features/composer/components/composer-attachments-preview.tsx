import { useComposerStore } from "@acme/features/composer";
import { getFileType } from "@acme/features/library";

import { LibraryFileIcon } from "~/features/library/components/library-file-icon";
import { ComposerAttachmentsList } from "./composer-attachments-list";

// number of files that will be shown in the preview, above where you enter
// your message
const MAX_DISPLAY_FILES = 3;

export function ComposerAttachmentsPreview() {
  const attachedFiles = useComposerStore((state) => state.attachedFiles);

  if (attachedFiles.length === 0) {
    return null;
  }

  const displayFiles = attachedFiles.slice(0, MAX_DISPLAY_FILES);
  const remainingCount = attachedFiles.length - MAX_DISPLAY_FILES;

  return (
    <ComposerAttachmentsList>
      <div className="hover:bg-accent/50 flex cursor-pointer flex-wrap gap-2 border-b p-4 transition-colors">
        {displayFiles.map((file) => {
          const fileType = getFileType(file.mimeType);
          return (
            <div
              key={file.id}
              className="bg-muted supports-[backdrop-filter]:bg-muted/50 hover:bg-muted/80 flex items-center gap-2 rounded-lg px-3 py-2 transition-colors"
            >
              <LibraryFileIcon fileType={fileType} className="h-4 w-4" />
              <span className="line-clamp-1 max-w-32 text-sm font-medium sm:max-w-none">
                {file.fileName}
              </span>
            </div>
          );
        })}
        {remainingCount > 0 && (
          <div className="bg-muted supports-[backdrop-filter]:bg-muted/50 hover:bg-muted/80 flex items-center gap-2 rounded-lg px-3 py-2 transition-colors">
            <span className="text-sm font-medium">+{remainingCount} more</span>
          </div>
        )}
      </div>
    </ComposerAttachmentsList>
  );
}
