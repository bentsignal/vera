import { X } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@acme/ui/tooltip";

export function ComposerSpeechCancel({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" onClick={onClick}>
          <X width={24} height={24} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Cancel recording</p>
      </TooltipContent>
    </Tooltip>
  );
}
