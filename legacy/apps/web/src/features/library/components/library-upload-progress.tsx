import { Progress } from "@acme/ui/progress";

export function LibraryUploadProgress({
  progress,
}: {
  progress: number | null;
}) {
  if (progress === null) return null;

  return (
    <div className="flex flex-col items-start justify-center gap-2">
      <span className="text-sm font-bold">Uploading {progress}%</span>
      <Progress value={progress} className="h-2 w-full" />
    </div>
  );
}
