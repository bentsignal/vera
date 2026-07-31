import { Info } from "lucide-react";

import type { MyUIMessage } from "@acme/features/messages";
import { useTypewriter } from "@acme/features/hooks";
import { getDateTimeString } from "@acme/features/lib/date-time-utils";
import {
  extractImageFromMessage,
  extractSourcesFromMessage,
  getVisibleErrors,
} from "@acme/features/messages";
import { useIsMobile } from "@acme/ui/hooks/use-mobile";
import { Markdown } from "@acme/ui/markdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@acme/ui/tooltip";

import { CopyButton } from "./copy-button";
import { ErrorMessage } from "./error-message";
import { markdownComponents } from "./markdown-components";
import { MessageImage } from "./message-image";
import { MessageSources } from "./message-sources";
import { MessageStatus } from "./message-status";
import { NoticeMessage } from "./notice-message";

export function ResponseMessage({
  message,
  isActive,
}: {
  message: MyUIMessage;
  isActive: boolean;
}) {
  const { animatedText } = useTypewriter({
    inputText: message.text,
    streaming: isActive,
  });
  const createdAt = getDateTimeString(new Date(message._creationTime));
  const isMobile = useIsMobile();

  const visibleErrors = getVisibleErrors(message);
  const sources = extractSourcesFromMessage(message);
  const image = extractImageFromMessage(message);
  const hasTextContent = animatedText.length > 0;

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <MessageStatus message={message} isActive={isActive} />
      <MessageSources sources={sources} />
      <MessageImage image={image} />
      {hasTextContent && (
        <div className="relative flex w-full max-w-full flex-col gap-2">
          <Markdown
            className="prose dark:prose-invert text-foreground! relative w-full max-w-full"
            components={markdownComponents}
          >
            {animatedText}
          </Markdown>
          {!isMobile && (
            <div
              className="flex justify-start gap-3 transition-opacity duration-1000"
              style={{
                opacity: !isActive && message._creationTime ? 1 : 0,
              }}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{createdAt}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <CopyButton getContent={() => message.text} />
            </div>
          )}
        </div>
      )}
      {message.notices?.map((notice, i) => (
        <NoticeMessage key={`notice-${i}`} code={notice.code} />
      ))}
      {visibleErrors.map((error, i) => (
        <ErrorMessage
          key={`error-${i}`}
          error={error}
          fallbackDateTime={createdAt}
        />
      ))}
    </div>
  );
}
