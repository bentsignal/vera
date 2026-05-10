import { useState } from "react";
import { useClerk } from "@clerk/tanstack-react-start";
import { toast } from "sonner";

import { cn } from "@acme/ui/utils";

import { GoogleIcon } from "./google-icon";

export function SignInButton({
  className,
  redirectUri,
}: {
  className?: string;
  redirectUri?: string;
}) {
  const clerk = useClerk();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const disabled = !clerk.loaded || isSubmitting;

  async function handleClick() {
    if (!clerk.loaded) return;
    setIsSubmitting(true);
    try {
      const result = await clerk.client.signIn.create({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        actionCompleteRedirectUrl: redirectUri ?? "/",
        oidcPrompt: "select_account",
      });

      const externalUrl =
        result.firstFactorVerification.externalVerificationRedirectURL;

      if (externalUrl) {
        const url = new URL(externalUrl.toString());
        if (!url.searchParams.has("prompt")) {
          url.searchParams.set("prompt", "select_account");
        }
        window.location.href = url.toString();
      } else {
        toast.error("Failed to get Google sign-in URL");
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to start Google sign-in");
      setIsSubmitting(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        className,
        "cursor-pointer disabled:cursor-not-allowed",
        "flex h-11 w-full flex-row items-center justify-center rounded-full border disabled:opacity-50",
        "border-[#747775] bg-white",
      )}
    >
      <GoogleIcon />
      <span
        style={{ fontFamily: "var(--font-roboto)" }}
        className="font-medium text-[#1F1F1F]"
      >
        Sign in with Google
      </span>
    </button>
  );
}
