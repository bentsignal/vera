import { createFileRoute } from "@tanstack/react-router";

import { Loader } from "@acme/ui/loader";

export const Route = createFileRoute("/signing-out")({
  component: SigningOut,
});

function SigningOut() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <Loader variant="dots" size="sm" />
      <span className="text-muted-foreground text-sm">Signing out</span>
    </div>
  );
}
