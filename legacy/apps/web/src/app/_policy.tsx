import { createFileRoute, useChildMatches } from "@tanstack/react-router";
import { MoveLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { QuickLink } from "~/features/quick-link/quick-link";

export const Route = createFileRoute("/_policy")({
  component: PolicyLayout,
  headers: () => ({
    "Cache-Control":
      "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400",
  }),
});

function PolicyLayout() {
  const content = useChildMatches({
    select: (matches) => matches.at(-1)?.loaderData ?? "",
  });

  return (
    <div className="h-screen w-screen overflow-y-auto">
      <div className="prose dark:prose-invert relative mx-auto my-4 mb-24 flex max-w-[800px] flex-col gap-8 px-4 py-8 sm:py-24">
        <QuickLink to="/" className="flex items-center gap-2">
          <MoveLeft className="size-4" />
          Return to home
        </QuickLink>
        <div>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
