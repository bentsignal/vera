import type { ErrorComponentProps } from "@tanstack/react-router";
// eslint-disable-next-line no-restricted-imports -- QuickLink is a web-only feature; xr uses the standard Link.
import { Link } from "@tanstack/react-router";

import { Button } from "@acme/ui/button";

export function Error(props: ErrorComponentProps) {
  console.error(props.error);
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="text-2xl font-bold">Something went wrong</span>
      <span>
        An error occurred while loading this page. Please try again later.
      </span>
      <Link to="/">
        <Button>Return to home</Button>
      </Link>
    </div>
  );
}
