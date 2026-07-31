import { DownloadIcon, Image as ImageIcon, X } from "lucide-react";

import { useLibraryStore } from "@acme/features/library";
import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";

import { Image } from "~/components/image";
import { useFileInteraction } from "../hooks/use-file-interaction";

const maxFileNameLength = 40;

function getDisplayFileName(fileName: string | undefined) {
  if (!fileName?.length) {
    return "Unnamed file";
  }
  if (fileName.length > maxFileNameLength) {
    return `${fileName.substring(0, maxFileNameLength)}...`;
  }
  return fileName;
}

export function LibraryPhotoViewer() {
  const photoViewerOpen = useLibraryStore((state) => state.photoViewerOpen);
  const setPhotoViewerOpen = useLibraryStore(
    (state) => state.setPhotoViewerOpen,
  );
  const selectedFile = useLibraryStore((state) => state.selectedFile);
  const { download } = useFileInteraction();

  const fileName = getDisplayFileName(selectedFile?.fileName);

  if (!selectedFile) {
    return null;
  }

  return (
    <Dialog open={photoViewerOpen} onOpenChange={setPhotoViewerOpen}>
      <DialogContent
        showCloseButton={false}
        className="z-200 border-none bg-transparent md:max-w-[700px] xl:max-w-[900px]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Photo Viewer</DialogTitle>
        </DialogHeader>
        <div className="border-border bg-card supports-[backdrop-filter]:bg-card/50 flex max-h-[900px] flex-col gap-4 rounded-xl border-1 px-8 pt-5 pb-8 backdrop-blur-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              <span className="line-clamp-1 text-sm">{fileName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => download([selectedFile.url])}
              >
                <DownloadIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPhotoViewerOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Image
            src={selectedFile.url}
            alt={fileName}
            width={900}
            height={800}
            className="h-full max-h-[800px] w-auto rounded-xl object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
