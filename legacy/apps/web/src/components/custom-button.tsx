import { Button } from "@acme/ui/button";
import { Loader } from "@acme/ui/loader";

import { cn } from "~/lib/utils";

export function CustomButton({
  loading,
  disabled,
  onClick,
  className,
  label,
  variant,
}: {
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  label?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
}) {
  return (
    <Button
      variant={variant ?? "default"}
      className={cn(className, "hover:cursor-pointer")}
      disabled={loading || disabled}
      onClick={onClick}
    >
      {loading ? <Loader variant="dots" size="sm" /> : (label ?? "Save")}
    </Button>
  );
}
