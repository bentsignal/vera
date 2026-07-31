import { createFileRoute } from "@tanstack/react-router";
import { AuthenticateWithRedirectCallback } from "@clerk/tanstack-react-start";

import { Loader } from "@acme/ui/loader";
import { cn } from "@acme/ui/utils";

export const Route = createFileRoute("/sso-callback")({
  component: SSOCallback,
});

function SSOCallback() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <AuthenticateWithRedirectCallback />
      <Loader variant="dots" size="sm" />
      <span
        className={cn(
          "text-muted-foreground fade-in animate-in fill-mode-backwards text-sm delay-1000 duration-500",
        )}
      >
        Getting things ready
      </span>
    </div>
  );
}
