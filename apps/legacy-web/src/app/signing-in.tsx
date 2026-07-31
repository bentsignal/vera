import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import { z } from "zod";

import { Loader } from "@acme/ui/loader";
import { cn } from "@acme/ui/utils";

export const Route = createFileRoute("/signing-in")({
  validateSearch: z.object({
    to: z.string().optional(),
  }),
  component: SigningIn,
});

function SigningIn() {
  const to = Route.useSearch({ select: (s) => s.to ?? "/home" });
  const { isSignedIn, isLoaded } = useAuth();

  // We're syncing a hard navigation to an external auth state (Clerk) that
  // settles asynchronously after the OAuth round-trip. There's no event we
  // can hang this off — the trigger is Clerk's in-memory session flipping to
  // signed-in — so an effect is the right tool here.
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      window.location.href = to;
    }
    if (isLoaded && isSignedIn) {
      finish();
      return;
    }
    const timeout = setTimeout(finish, 2000);
    return () => clearTimeout(timeout);
  }, [isLoaded, isSignedIn, to]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
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
