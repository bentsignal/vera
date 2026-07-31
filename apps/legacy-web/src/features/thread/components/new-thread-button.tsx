import { useNavigate } from "@tanstack/react-router";
import { SquarePen } from "lucide-react";

import { shortcuts } from "@acme/features/shortcuts";
import { Button } from "@acme/ui/button";
import { useIsMobile } from "@acme/ui/hooks/use-mobile";
import { useSidebar } from "@acme/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@acme/ui/tooltip";

import { useShortcut } from "~/features/shortcuts/hooks/use-shortcut";

export function NewThreadButton() {
  const { toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // start new thread on "ctrl/cmd + /"
  useShortcut({
    hotkey: shortcuts["new-chat"].hotkey,
    callback: () => {
      void navigate({ to: "/home" });
    },
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          onClick={() => {
            if (isMobile) {
              toggleSidebar();
            }
            void navigate({ to: "/home" });
          }}
        >
          <SquarePen className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>New chat</p>
      </TooltipContent>
    </Tooltip>
  );
}
