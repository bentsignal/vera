import { Markdown } from "@acme/ui/markdown";

import { InfoCard } from "~/components/info-card";
import { CopyButton } from "~/features/messages/components/copy-button";
import { markdownComponents } from "~/features/messages/components/markdown-components";
import { appUrls } from "~/urls";

export function Bangs() {
  const bangURL = `${appUrls.web}/new?q=%s`;
  const bang = `\`\n${bangURL}\n\`\n`;
  return (
    <InfoCard title="Search">
      <span>
        Add the following URL to your browser&apos;s search engine settings to
        create new chats directly from your browser&apos;s search bar.
      </span>
      <div className="prose dark:prose-invert relative flex w-full max-w-full flex-row items-center justify-start gap-2">
        <Markdown
          className="prose dark:prose-invert"
          components={markdownComponents}
        >
          {bang}
        </Markdown>
        <CopyButton getContent={() => bangURL} />
      </div>
    </InfoCard>
  );
}
