import { Library as LibraryIcon } from "lucide-react";

import { useLibraryStore } from "@acme/features/library";
import { shortcuts } from "@acme/features/shortcuts";
import { Button } from "@acme/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@acme/ui/tooltip";

import { useShortcut } from "~/features/shortcuts/hooks/use-shortcut";

export function LibraryButton() {
  const setLibraryOpen = useLibraryStore((state) => state.setLibraryOpen);

  useShortcut({
    hotkey: shortcuts.library.hotkey,
    callback: () => setLibraryOpen(true),
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setLibraryOpen(true)}
        >
          <LibraryIcon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Library</p>
      </TooltipContent>
    </Tooltip>
  );
}
