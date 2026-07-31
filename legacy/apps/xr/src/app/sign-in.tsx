import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { Button } from "@acme/ui/button";

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
  beforeLoad: ({ context }) => {
    if (context.auth.isSignedIn) {
      throw redirect({ to: "/" });
    }
  },
});

function SignInPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Sign in to continue</h1>
      <Button
        onClick={() => {
          void navigate({ to: "/sign-in", search: { signin: true } });
        }}
      >
        Sign in
      </Button>
    </div>
  );
}
