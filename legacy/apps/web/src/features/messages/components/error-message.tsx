import { useState } from "react";
import { Check, Copy, Info } from "lucide-react";

import type { SystemError } from "@acme/features/messages";
import { getErrorMessage } from "@acme/features/messages";
import { Button } from "@acme/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@acme/ui/popover";

function formatTimestamp(timestamp: number | undefined) {
  if (timestamp === undefined) return undefined;
  return new Date(timestamp).toISOString();
}

function buildSupportPayload(error: SystemError) {
  const lines = [`code: ${error.code}`];
  if (error.generationId) lines.push(`generationId: ${error.generationId}`);
  const timestamp = formatTimestamp(error.timestamp);
  if (timestamp) lines.push(`timestamp: ${timestamp}`);
  return lines.join("\n");
}

function CopyErrorButton({ error }: { error: SystemError }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildSupportPayload(error));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy error info:", err);
    }
  }

  return (
    <Button onClick={handleCopy} size="sm" variant="outline" className="w-full">
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy error details
        </>
      )}
    </Button>
  );
}

export function ErrorMessage({
  error,
  fallbackDateTime,
}: {
  error: SystemError;
  fallbackDateTime?: string;
}) {
  const message = getErrorMessage(error.code);
  const timestampDisplay = formatTimestamp(error.timestamp) ?? fallbackDateTime;

  return (
    <div className="flex w-full items-start gap-2">
      <div className="flex justify-start pt-0.5">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="cursor-help"
              aria-label="Error details"
            >
              <Info className="text-destructive h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-96">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-muted-foreground shrink-0">Code:</span>
                  <span className="text-destructive font-mono font-semibold break-all">
                    {error.code}
                  </span>
                </div>
                {timestampDisplay && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-muted-foreground shrink-0">
                      Time:
                    </span>
                    <span className="font-mono break-all">
                      {timestampDisplay}
                    </span>
                  </div>
                )}
                {error.generationId && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-muted-foreground shrink-0">
                      Generation:
                    </span>
                    <span className="font-mono break-all">
                      {error.generationId}
                    </span>
                  </div>
                )}
              </div>
              <CopyErrorButton error={error} />
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <span className="text-muted-foreground text-sm">
        <span className="text-destructive font-bold">System Error:</span>{" "}
        {message}
      </span>
    </div>
  );
}
