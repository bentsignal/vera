import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { buildRedirectUrl } from "@/features/auth/auth-utils";
import { HomeHero } from "@/features/home/home-hero";
import { HomeSuggestions } from "@/features/home/home-suggestions";

import { homeQueries } from "@acme/features/home";
import { Button } from "@acme/ui/button";

import { ComposerSendButton } from "~/features/composer/primitives/composer-send-button";
import { ComposerShell } from "~/features/composer/primitives/composer-shell";
import { ComposerTextarea } from "~/features/composer/primitives/composer-textarea";
import { QuickLink } from "~/features/quick-link/quick-link";

export const Route = createFileRoute("/")({
  component: Landing,
  beforeLoad: ({ context }) => {
    if (context.auth.isSignedIn) {
      throw redirect({ to: "/home" });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(homeQueries.suggestions());
  },
});

function Landing() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");

  function goToSignIn(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    void navigate({
      to: "/",
      search: {
        signin: true,
        redirect_url: buildRedirectUrl(trimmed),
      },
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      goToSignIn(value);
    }
  }

  return (
    <div className="flex h-screen w-full flex-1 flex-col items-center justify-center gap-2">
      <HomeHero title="Welcome" />
      <div className="w-full">
        <ComposerShell
          input={
            <ComposerTextarea
              value={value}
              onChange={setValue}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          }
          actions={<ComposerSendButton onClick={() => goToSignIn(value)} />}
        />
      </div>
      <HomeSuggestions onSelect={goToSignIn} />
      <Button asChild className="mt-2">
        <QuickLink
          to="/"
          search={{ signin: true }}
          className="text-lg font-semibold"
        >
          Get Started
        </QuickLink>
      </Button>
    </div>
  );
}
