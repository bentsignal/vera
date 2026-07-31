import { File, FileText, Image as ImageIcon } from "lucide-react";

import { cn } from "~/lib/utils";

export function LibraryFileIcon({
  fileType,
  className,
}: {
  fileType: "image" | "document" | "file";
  className?: string;
}) {
  if (fileType === "image") {
    return <ImageIcon className={cn("h-5 w-5", className)} />;
  }
  if (fileType === "document") {
    return <FileText className={cn("h-5 w-5", className)} />;
  }
  return <File className={cn("h-10 w-10", className)} />;
}
