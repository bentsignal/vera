import { Paperclip } from "lucide-react";

import { useLibraryStore } from "@acme/features/library";
import { Button } from "@acme/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@acme/ui/tooltip";

export function ComposerAddAttachments() {
  const setLibraryOpen = useLibraryStore((state) => state.setLibraryOpen);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setLibraryOpen(true);
          }}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Add attachments</TooltipContent>
    </Tooltip>
  );
}
