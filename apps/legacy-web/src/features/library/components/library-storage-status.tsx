import { Progress } from "@acme/ui/progress";

import { QuickLink } from "~/features/quick-link/quick-link";
import { cn } from "~/lib/utils";

export function LibraryStorageStatus({
  storageUsed,
  storageLimit,
  percentageUsed,
}: {
  storageUsed: number;
  storageLimit: number;
  percentageUsed: number;
}) {
  const remainingGB = (
    (storageLimit - storageUsed) /
    1024 /
    1024 /
    1024
  ).toFixed(2);

  const textColor =
    percentageUsed >= 90
      ? "text-destructive"
      : percentageUsed >= 75
        ? "text-yellow-500"
        : "text-muted-foreground";

  if (storageLimit === 0) {
    return (
      <div className="m-4 flex flex-col gap-4">
        <QuickLink
          to="/pricing"
          className="text-primary text-sm font-bold text-wrap underline"
        >
          Upgrade to premium to access file storage.
        </QuickLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {percentageUsed > 75 ||
        (Number.isNaN(percentageUsed) && (
          <QuickLink
            to="/pricing"
            className="text-primary text-sm font-bold underline"
          >
            Upgrade
          </QuickLink>
        ))}
      <span className={cn("text-muted-foreground text-sm", textColor)}>
        <span className="font-bold">{remainingGB} GB</span> available
      </span>
      <Progress value={percentageUsed} className="h-2" />
    </div>
  );
}
