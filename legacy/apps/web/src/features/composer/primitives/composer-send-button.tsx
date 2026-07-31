import { Send, Square } from "lucide-react";

import { Button } from "@acme/ui/button";

export function ComposerSendButton({
  onClick,
  disabled,
  mode = "send",
}: {
  onClick: () => void;
  disabled?: boolean;
  mode?: "send" | "stop";
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      size="icon"
      className="shrink-0"
      aria-label={mode === "stop" ? "Stop generating" : "Send message"}
    >
      {mode === "stop" ? (
        <Square className="h-4 w-4 fill-current" />
      ) : (
        <Send className="h-4 w-4" />
      )}
    </Button>
  );
}
