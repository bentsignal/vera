import { useState } from "react";

import type { MyUIMessage } from "@acme/features/messages";
import { getFileType } from "@acme/features/library";
import { Markdown } from "@acme/ui/markdown";
import { Sheet, SheetContent, SheetTrigger } from "@acme/ui/sheet";

import { LibraryListFile } from "~/features/library/components/library-file";
import { LibraryFileIcon } from "~/features/library/components/library-file-icon";
import { CopyButton } from "./copy-button";
import { markdownComponents } from "./markdown-components";

const MAX_DISPLAY_FILES = 3;

export function PromptMessage({ message }: { message: MyUIMessage }) {
  const [hovering, setHovering] = useState(false);

  return (
    <div
      className="relative flex items-center justify-end"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="bg-sidebar/50 flex max-w-lg flex-col overflow-hidden rounded-xl px-5 py-4 shadow-md backdrop-blur-lg">
        <Markdown
          className="prose dark:prose-invert relative w-full max-w-full"
          components={markdownComponents}
        >
          {message.text}
        </Markdown>
        <Attachments message={message} />
      </div>
      <div
        className="absolute right-0 -bottom-10 mt-2 flex justify-end transition-opacity duration-300 ease-in-out"
        style={{ opacity: hovering ? 1 : 0 }}
      >
        <CopyButton getContent={() => message.text} />
      </div>
    </div>
  );
}

function Attachments({ message }: { message: MyUIMessage }) {
  if (
    !message.metadata?.attachments ||
    message.metadata.attachments.length === 0
  ) {
    return null;
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <div className="inline-flex w-fit cursor-pointer flex-wrap gap-2 pt-3">
          {message.metadata.attachments
            .slice(0, MAX_DISPLAY_FILES)
            .map((file) => {
              const fileType = getFileType(file.mimeType);
              return (
                <div
                  key={file.id}
                  className="bg-card supports-[backdrop-filter]:bg-card/50 hover:bg-card/50 supports-[backdrop-filter]:hover:bg-card/80 flex h-10 max-w-48 items-center gap-2 rounded-lg px-3 py-2 transition-colors"
                >
                  <LibraryFileIcon
                    fileType={fileType}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="line-clamp-1 text-left text-sm font-medium sm:max-w-none">
                    {file.fileName}
                  </span>
                </div>
              );
            })}
          {message.metadata.attachments.length - MAX_DISPLAY_FILES > 0 && (
            <div className="bg-muted hover:bg-muted/80 flex items-center gap-2 rounded-lg px-3 py-2 transition-colors">
              <span className="text-sm font-medium">
                +{message.metadata.attachments.length - MAX_DISPLAY_FILES} more
              </span>
            </div>
          )}
        </div>
      </SheetTrigger>
      <SheetContent className="z-150 w-2xl max-w-screen overflow-y-auto md:max-w-lg">
        <div className="flex flex-col gap-4 px-8 py-12">
          {message.metadata.attachments.map((file) => (
            <LibraryListFile
              key={file.id}
              file={file}
              mode="default"
              selected={false}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
