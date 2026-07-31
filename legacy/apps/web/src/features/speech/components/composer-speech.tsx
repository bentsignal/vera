import { Mic } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@acme/ui/tooltip";

import type { SpeechApi } from "~/features/speech/hooks/use-speech";
import { cn } from "~/lib/utils";

export function ComposerSpeech({ speech }: { speech: SpeechApi }) {
  const { startSpeech, stopSpeech, inProgress, processing, disabled } = speech;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "transcribing-glow",
            processing && "transcribing-glow-active",
          )}
        >
          <Button
            variant="outline"
            size="icon"
            onClick={inProgress ? stopSpeech : startSpeech}
            disabled={disabled}
          >
            <Mic
              width={24}
              height={24}
              className={cn(inProgress ? "animate-pulse text-red-400" : "")}
            />
          </Button>
        </div>
      </TooltipTrigger>
      {!disabled && (
        <TooltipContent>
          <p>
            {inProgress
              ? "Recording… press again to finish"
              : processing
                ? "Transcribing, one moment…"
                : "Record your voice"}
          </p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}
