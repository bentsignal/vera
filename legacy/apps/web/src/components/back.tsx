import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";

import { cn } from "~/lib/utils";

export function Back({ className }: { className?: string }) {
  const navigate = useNavigate();
  return (
    <X
      onClick={() => navigate({ to: "..", replace: true })}
      className={cn("hover:cursor-pointer", className)}
    />
  );
}
