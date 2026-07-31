import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { HomeHero } from "@/features/home/home-hero";
import { HomeSuggestions } from "@/features/home/home-suggestions";

import { homeQueries } from "@acme/features/home";

import { UsageChatCallout } from "~/features/billing/components/usage-chat-callout";
import { Composer } from "~/features/composer/composer";
import { useSendMessage } from "~/features/composer/hooks/use-send-message";

export const Route = createFileRoute("/_authenticated/home")({
  component: Home,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(homeQueries.suggestions());
  },
});

function Home() {
  const [pending, setPending] = useState(false);
  const { sendMessage } = useSendMessage();

  function showInstantLoad() {
    setPending(true);
  }
  function handleError() {
    setPending(false);
  }

  if (pending) return null;

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-2">
      <HomeHero />
      <div className="w-full">
        <Composer showInstantLoad={showInstantLoad} handleError={handleError} />
      </div>
      <HomeSuggestions
        onSelect={(prompt) =>
          void sendMessage({
            customPrompt: prompt,
            showInstantLoad,
            handleError,
          })
        }
      />
      <UsageChatCallout />
    </div>
  );
}
