import { createFileRoute } from "@tanstack/react-router";
import { QuickLink } from "@/features/quick-link/quick-link";

import { Button } from "@acme/ui/button";

export const Route = createFileRoute("/goodbye")({
  component: GoodbyePage,
});

function GoodbyePage() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center">
      <div className="mx-4 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Account Successfully Deleted</h1>
        <p className="text-muted-foreground text-md mb-1 text-center">
          Sorry to see you go. If you change your mind down the road, you know
          where to find us!
        </p>
        <QuickLink to="/">
          <Button>Back to home</Button>
        </QuickLink>
      </div>
    </div>
  );
}
