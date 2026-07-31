import { useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";

import { api } from "@acme/db/api";
import { homeQueries } from "@acme/features/home";

import { Abyss } from "~/components/abyss";
import { cn } from "~/lib/utils";

export function HomeSuggestions({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  const { data: prompts } = useSuspenseQuery({
    ...homeQueries.suggestions(),
    select: (data) => data.map((d) => ({ _id: d._id, prompt: d.prompt })),
  });
  const incrementClickCount = useMutation(
    api.ai.suggestions.incrementClickCount,
  );

  return (
    <div className="relative mx-auto w-full max-w-2xl mask-b-from-80%">
      <Abyss height={100} top={false} />
      <div
        className={cn(
          "flex w-full flex-col items-start gap-2 px-4 pb-12 text-sm",
          "h-[300px] overflow-y-auto",
          "scrollbar-thin scrollbar-thumb-transparent scrollbar-track-transparent",
        )}
      >
        {prompts.map((prompt) => (
          <span
            key={prompt._id}
            className={cn(
              "bg-card/50 text-card-foreground hover:bg-card/70 w-full rounded-lg p-4 shadow-md transition-all duration-300 select-none",
            )}
            role="button"
            aria-label={`Suggested homepage prompt: ${prompt.prompt}`}
            onClick={() => {
              void incrementClickCount({ id: prompt._id });
              onSelect(prompt.prompt);
            }}
          >
            {prompt.prompt}
          </span>
        ))}
      </div>
    </div>
  );
}
