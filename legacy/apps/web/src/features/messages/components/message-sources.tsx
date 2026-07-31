import { ExternalLink } from "lucide-react";

import type { Source } from "@acme/features/types/source";
import { Sheet, SheetContent, SheetTrigger } from "@acme/ui/sheet";

import { Image } from "~/components/image";

function PureMessageSources({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;

  return (
    <Sheet>
      <SheetTrigger className="w-full">
        <PreviewSources sources={sources} />
      </SheetTrigger>
      <SheetContent className="z-150 w-2xl max-w-screen overflow-y-auto md:max-w-xl">
        <ExpandedSources sources={sources} />
      </SheetContent>
    </Sheet>
  );
}

export const MessageSources = PureMessageSources;

function PreviewSources({ sources }: { sources: Source[] }) {
  const favicons = sources
    .filter(
      (source, index, self) =>
        self.findIndex((t) => t.favicon === source.favicon) === index,
    )
    .map((source) => source.favicon)
    .filter(
      (favicon): favicon is string =>
        typeof favicon === "string" && favicon.length > 0,
    )
    .slice(0, 5);

  return (
    <div className="bg-card supports-[backdrop-filter]:bg-card/50 flex w-fit items-center gap-3 rounded-full px-4 py-2 select-none hover:cursor-pointer">
      {favicons.length > 0 && (
        <div className="flex gap-2">
          {favicons.map((favicon, index) => (
            <Image
              key={`favicon-${index}`}
              src={favicon}
              alt={" "}
              width={16}
              height={16}
              className="h-4 w-4 rounded-lg"
              errorMode="icon"
            />
          ))}
        </div>
      )}
      <span className="text-muted-foreground text-sm font-bold">
        {sources.length} source{sources.length > 1 ? "s" : ""}
      </span>
    </div>
  );
}

function ExpandedSources({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-col gap-8 px-8 py-12">
      {sources.map((source, index) => {
        const hostname = (() => {
          try {
            return new URL(source.url).hostname.replace(/^www\./, "");
          } catch {
            return source.url;
          }
        })();
        return (
          <a
            key={`${source.url}-${index}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex w-full flex-col gap-4 rounded-xl px-4 transition-colors"
          >
            {source.image ? (
              <div className="shrink-0">
                <Image
                  src={source.image}
                  alt={source.title ?? hostname}
                  width={640}
                  height={384}
                  className="max-h-96 w-full rounded-lg object-cover"
                  errorClassName="h-64"
                />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="mb-1 flex items-start gap-2">
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  {source.favicon ? (
                    <Image
                      src={source.favicon}
                      alt={hostname}
                      width={16}
                      height={16}
                      className="h-4 w-4 rounded"
                      errorMode="icon"
                    />
                  ) : null}
                  <span className="truncate">{hostname}</span>
                </div>
              </div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 text-base leading-tight font-semibold">
                  {source.title ?? hostname}
                </h3>
                <ExternalLink className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
