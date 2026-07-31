import { useState } from "react";
import {
  Brain,
  Clock,
  // Code,
  File,
  Globe,
  Image as ImageIcon,
  Newspaper,
  Sun,
} from "lucide-react";

import type { MyUIMessage } from "@acme/features/messages";
import {
  extractReasoningFromMessage,
  getStatusLabel,
  useSmoothText,
} from "@acme/features/messages";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@acme/ui/hover-card";
import { TextShimmer } from "@acme/ui/loader";
import { Markdown } from "@acme/ui/markdown";

import { Abyss } from "~/components/abyss";
import { cn } from "~/lib/utils";
import { markdownComponents } from "./markdown-components";

export function MessageStatus({
  message,
  isActive,
}: {
  message: MyUIMessage;
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const content = extractReasoningFromMessage(message);
  if (content.length === 0) return null;

  const statusLabel = getStatusLabel(message.parts);

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <HoverCard
        openDelay={200}
        closeDelay={200}
        open={open}
        onOpenChange={setOpen}
      >
        <HoverCardTrigger>
          <div className="flex cursor-pointer items-center gap-2 py-0.5 select-none">
            {statusLabel === "Checking the time" ? (
              <Clock className="h-4 w-4" />
            ) : statusLabel === "Searching for information" ? (
              <Globe className="h-4 w-4" />
            ) : statusLabel === "Checking the news" ? (
              <Newspaper className="h-4 w-4" />
            ) : statusLabel === "Checking the weather" ? (
              <Sun className="h-4 w-4" />
            ) : statusLabel === "Analyzing files" ? (
              <File className="h-4 w-4" />
            ) : // ) : statusLabel === "Generating code" ? (
            //   <Code className="h-4 w-4" />
            statusLabel === "Generating image" ? (
              <ImageIcon className="h-4 w-4" />
            ) : (
              <Brain className="h-4 w-4" />
            )}
            <TextShimmer active={isActive} text={statusLabel} />
          </div>
        </HoverCardTrigger>
        {open && (
          <HoverCardContent
            className={cn(
              "bg-card supports-[backdrop-filter]:bg-card/50 prose dark:prose-invert relative backdrop-blur-lg",
              "w-lg rounded-md border",
              "overflow-hidden rounded-4xl p-0",
            )}
            align="start"
          >
            <Abyss height={50} blur="sm" />
            <ReasoningBody content={content} />
          </HoverCardContent>
        )}
      </HoverCard>
    </div>
  );
}

function ReasoningBody({ content }: { content: string }) {
  const [text] = useSmoothText(content);
  return (
    <div
      className={cn(
        "scrollbar-thin scrollbar-thumb-transparent scrollbar-track-transparent",
        "h-64 w-full overflow-y-auto mask-t-from-70% mask-b-from-70% p-8",
      )}
    >
      <Markdown
        className="prose dark:prose-invert relative w-full max-w-full text-sm"
        components={markdownComponents}
      >
        {text}
      </Markdown>
    </div>
  );
}
