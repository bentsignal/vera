import { useState } from "react";
import { Plus } from "lucide-react";

import type { LibraryFile, LibraryMode } from "@acme/features/library";
import { getFileType } from "@acme/features/library";
import { Button } from "@acme/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@acme/ui/tooltip";

import { Image } from "~/components/image";
import { cn } from "~/lib/utils";
import { useFileInteraction } from "../hooks/use-file-interaction";
import { LibraryFileIcon } from "./library-file-icon";

interface LibraryFileProps {
  file: LibraryFile;
  mode: LibraryMode;
  selected: boolean;
}

function AddToMessageButton({
  onClick,
  className,
}: {
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="default"
          onClick={onClick}
          className={className}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Add to message</TooltipContent>
    </Tooltip>
  );
}

function SelectIndicator({ selected }: { selected: boolean }) {
  return (
    <div
      className={cn(
        "absolute top-2 right-2 z-10 h-3 w-3 rounded-full",
        selected ? "bg-primary" : "border-primary border",
      )}
    />
  );
}

export function LibraryGridFile({ file, mode, selected }: LibraryFileProps) {
  const fileType = getFileType(file.mimeType);
  const [isHovered, setIsHovered] = useState(false);

  const { handleFileClick, handleFileHover, handleAddAttachment } =
    useFileInteraction();

  return (
    <div
      onClick={() => handleFileClick(file, mode, selected)}
      onMouseEnter={() => {
        handleFileHover(file, mode);
        setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "bg-card/30 hover:bg-card/50 relative flex min-h-40 w-full flex-col items-center gap-4 rounded-lg p-4 shadow-sm transition-all select-none hover:cursor-pointer",
        mode === "select" && !selected && "opacity-50",
      )}
    >
      {mode === "select" && <SelectIndicator selected={selected} />}
      {mode === "default" && isHovered && (
        <AddToMessageButton
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            handleAddAttachment(file);
          }}
          className="absolute top-2 right-2 z-10 h-7 w-7 p-0"
        />
      )}
      <div className="relative flex h-40 w-full items-center justify-center sm:h-20">
        {fileType === "image" ? (
          <Image
            src={file.url}
            alt={file.fileName}
            width={320}
            height={160}
            className="h-full w-full rounded-xl object-cover"
          />
        ) : (
          <LibraryFileIcon fileType={fileType} className="h-10 w-10" />
        )}
      </div>
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-1">
        <span className="line-clamp-2 w-[80%] text-center text-sm font-medium">
          {file.fileName}
        </span>
      </div>
    </div>
  );
}

export function LibraryListFile({ file, mode, selected }: LibraryFileProps) {
  const fileType = getFileType(file.mimeType);
  const [isHovered, setIsHovered] = useState(false);

  const { handleFileClick, handleFileHover, handleAddAttachment } =
    useFileInteraction();

  return (
    <div
      onClick={() => handleFileClick(file, mode, selected)}
      onMouseEnter={() => {
        handleFileHover(file, mode);
        setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "bg-card/30 hover:bg-card/50 row relative flex w-full items-center gap-4 rounded-lg p-4 shadow-sm transition-all select-none hover:cursor-pointer",
        mode === "select" && !selected && "opacity-50",
      )}
    >
      {mode === "select" && (
        <div className="absolute top-0 right-0 z-10 flex h-full items-center justify-center">
          <div
            className={cn(
              "mx-4 h-3 w-3 rounded-full",
              selected ? "bg-primary" : "border-primary border",
            )}
          />
        </div>
      )}
      {mode === "default" && isHovered && (
        <div className="absolute top-0 right-0 z-200 flex h-full items-center justify-center p-0 px-4 opacity-100">
          <AddToMessageButton
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              handleAddAttachment(file);
            }}
          />
        </div>
      )}
      <div className="relative flex h-10 items-center justify-center">
        {fileType === "image" ? (
          <Image
            src={file.url}
            alt={file.fileName}
            width={80}
            height={40}
            className="h-full w-20 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-full w-10 items-center justify-center">
            <LibraryFileIcon fileType={fileType} className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="line-clamp-1 text-sm font-medium">
          {file.fileName}
        </span>
      </div>
    </div>
  );
}
