"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";

import { cn } from "../lib/utils";

export type CodeBlockProps = {
  children?: React.ReactNode;
  className?: string;
} & React.HTMLProps<HTMLDivElement>;

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose flex w-full flex-col overflow-clip border",
        "border-border bg-card supports-[backdrop-filter]:bg-card/50 text-card-foreground rounded-xl backdrop-blur-sm",
        "max-h-[800px]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type CodeBlockCodeProps = {
  code: string;
  language?: string;
  theme?: string;
  className?: string;
} & React.HTMLProps<HTMLDivElement>;

function CodeBlockCode({
  code,
  language = "tsx",
  theme = "github-light",
  className,
  ...props
}: CodeBlockCodeProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  useEffect(() => {
    async function highlight() {
      if (!code) {
        setHighlightedHtml("<pre><code></code></pre>");
        return;
      }

      const html = await codeToHtml(code, {
        lang: language,
        theme,
        transformers: [
          {
            pre(node) {
              node.properties.style = undefined;
            },
            code(node) {
              node.properties.style = undefined;
            },
          },
        ],
      });
      setHighlightedHtml(html);
    }
    void highlight();
  }, [code, language, theme]);

  const classNames = cn(
    "w-full overflow-auto text-[13px]",
    "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent",
    className,
  );

  // SSR fallback: render plain code if not hydrated yet
  return highlightedHtml ? (
    <div
      className={classNames}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      {...props}
    />
  ) : (
    <div className={classNames} {...props}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>;

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock };
