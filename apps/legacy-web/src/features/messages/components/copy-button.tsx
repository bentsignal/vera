import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@acme/ui/button";

import { cn } from "~/lib/utils";

interface CopyButtonProps {
  size?: "sm" | "default";
  variant?: "ghost" | "outline" | "default";
  className?: string;
  getContent: () => string;
}

export function CopyButton({
  size = "sm",
  variant = "ghost",
  className = "",
  getContent,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      const textToCopy = getContent().trim();
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  }

  return (
    <Button
      onClick={handleCopy}
      size={size}
      variant={variant}
      className={cn("h-8 w-8 p-0", className)}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}
