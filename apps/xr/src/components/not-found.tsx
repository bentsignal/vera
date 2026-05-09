// eslint-disable-next-line no-restricted-imports -- QuickLink is a web-only feature; xr uses the standard Link.
import { Link } from "@tanstack/react-router";

import { Button } from "@acme/ui/button";

export function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="text-2xl font-bold">Vera</span>
      <span>
        We had some trouble finding that page. If you think this is an error,
        please{" "}
        <span className="text-primary font-bold">
          <a href="mailto:support@bsx.sh">contact support.</a>
        </span>
      </span>
      <Link to="/">
        <Button>Return to home</Button>
      </Link>
    </div>
  );
}
