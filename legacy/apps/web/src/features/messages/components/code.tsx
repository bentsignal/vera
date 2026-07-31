import type { ReactNode } from "react";

// import { useTheme } from "next-themes";
import { extractTextFromChildren } from "@acme/features/messages";
import { CodeBlock, CodeBlockCode } from "@acme/ui/code-block";

import { CopyButton } from "./copy-button";
import { Language } from "./language";

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Code({ inline, className, children }: CodeProps) {
  // const { theme } = useTheme();
  const isBlock = !inline && (className?.includes("language-") ?? false);

  if (isBlock) {
    return (
      <div className="not-prose group border-border relative my-2 w-full overflow-hidden rounded-xl border-1">
        <div className="bg-border flex h-14 w-full items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Language className={className} />
          </div>
          <div className="flex items-center gap-2">
            <CopyButton getContent={() => extractTextFromChildren(children)} />
          </div>
        </div>
        <CodeBlock className="rounded-t-none border-none bg-transparent p-6">
          <CodeBlockCode
            code={extractTextFromChildren(children)}
            // theme={theme === "dark" ? "github-dark" : "github-light"}
            theme="github-dark"
          />
        </CodeBlock>
      </div>
    );
  }
  return (
    <div className="not-prose inline-flex max-w-full">
      <CodeBlock className="rounded-md px-2 py-1">
        <CodeBlockCode
          code={extractTextFromChildren(children)}
          // theme={theme === "dark" ? "github-dark" : "github-light"}
          theme="github-dark"
          className="text-sm"
        />
      </CodeBlock>
    </div>
  );
}
