import { Image } from "~/components/image";
import { cn } from "~/lib/utils";

import "@/styles/logo-anim.css";

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.webp"
      alt="Logo"
      width={100}
      height={100}
      className={cn("size-[100px] mask-r-from-5% invert", className)}
    />
  );
}
