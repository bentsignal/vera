import { Loader } from "@acme/ui/loader";

export function DefaultLoading() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Loader variant="dots" size="sm" />
    </div>
  );
}
