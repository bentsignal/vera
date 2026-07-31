import { useState } from "react";
// eslint-disable-next-line no-restricted-imports -- useQuery needed here because storage data is not preloaded in route loader
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { api } from "@acme/db/api";

import { UploadButton } from "~/lib/uploadthing";
import { LibraryStorageStatus } from "./library-storage-status";
import { LibraryUploadProgress } from "./library-upload-progress";

export function LibraryUpload() {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const { data: storageStatus } = useQuery({
    ...convexQuery(api.app.library.getStorageStatus, {}),
    select: (data) => ({
      storageUsed: data.storageUsed,
      storageLimit: data.storageLimit,
    }),
  });

  if (!storageStatus) return null;

  const percentageUsed = Math.min(
    storageStatus.storageUsed / storageStatus.storageLimit,
    100,
  );
  const disabled = storageStatus.storageLimit === 0 || percentageUsed >= 100;

  return (
    <div className="m-4 flex flex-col gap-4">
      <LibraryUploadProgress progress={uploadProgress} />
      <LibraryStorageStatus
        storageUsed={storageStatus.storageUsed}
        storageLimit={storageStatus.storageLimit}
        percentageUsed={percentageUsed}
      />
      <UploadButton
        endpoint="uploadRoute"
        disabled={disabled}
        onClientUploadComplete={(res) => {
          const error = res[0]?.serverData.error;
          if (error) {
            toast.error(error);
            return;
          }
        }}
        content={{
          button({ ready, isUploading, uploadProgress }) {
            // update progress bar
            if (isUploading) {
              setUploadProgress(uploadProgress);
            } else {
              setUploadProgress(null);
            }

            // let user cancel upload while in progress
            if (isUploading) {
              return (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-bold">Cancel</span>
                </div>
              );
            }

            // show upload button
            if (ready) {
              return (
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  <span className="text-sm font-bold">Upload</span>
                </div>
              );
            }
          },
          allowedContent: " ",
        }}
        appearance={{
          button: disabled
            ? "bg-muted text-muted-foreground! w-full text-sm font-bold cursor-not-allowed! select-none"
            : "bg-primary text-primary-foreground! hover:bg-primary/90 w-full text-sm font-bold",
        }}
        onUploadError={(error: Error) => {
          console.error(error);
          toast.error(error.message);
        }}
      />
    </div>
  );
}
