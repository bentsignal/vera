import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@acme/ui/drawer";
import { useIsMobile } from "@acme/ui/hooks/use-mobile";
import { cn } from "@acme/ui/utils";

import { SignInButton } from "./sign-in-button";
import { Terms } from "./terms";

const TITLE = "Vera";

const GLASS_CONTAINER =
  "bg-card supports-[backdrop-filter]:bg-card/20 backdrop-blur-sm border";

export function LoginModal({
  open,
  onClose,
  redirectUri,
  tosURL,
  privacyURL,
}: {
  open: boolean;
  onClose: () => void;
  redirectUri?: string;
  tosURL: string;
  privacyURL: string;
}) {
  const isMobile = useIsMobile();

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) return;
    onClose();
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent
          className={cn(
            "bg-card mx-2 -mb-1 rounded-xl border",
            GLASS_CONTAINER,
          )}
        >
          <DrawerHeader className="items-center pb-2 text-center">
            <DrawerTitle className="text-base font-medium">{TITLE}</DrawerTitle>
            <DrawerDescription className="sr-only">
              Sign in to Vera
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-3 px-5 pb-5">
            <SignInButton redirectUri={redirectUri} />
            <Terms tosURL={tosURL} privacyURL={privacyURL} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn("bg-card gap-3 p-5 sm:max-w-[340px]", GLASS_CONTAINER)}
      >
        <DialogHeader className="items-center text-center">
          <DialogTitle className="text-base font-medium">{TITLE}</DialogTitle>
          <DialogDescription className="sr-only">
            Sign in to Vera
          </DialogDescription>
        </DialogHeader>
        <SignInButton redirectUri={redirectUri} />
        <Terms tosURL={tosURL} privacyURL={privacyURL} />
      </DialogContent>
    </Dialog>
  );
}
