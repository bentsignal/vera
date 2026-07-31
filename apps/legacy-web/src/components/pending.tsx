import { Loader } from "@acme/ui/loader";

export function Pending() {
  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <Loader variant="dots" size="sm" />
    </div>
  );
}
