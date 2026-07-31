import type { ReactNode } from "react";

export function ComposerShell({
  attachments,
  input,
  actions,
}: {
  attachments?: ReactNode;
  input: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <div className="bg-card supports-[backdrop-filter]:bg-card/50 max-w-4xl rounded-xl border shadow-lg backdrop-blur">
        {attachments}
        <div className="flex flex-col items-end gap-3 p-4 sm:flex-row">
          {input}
          <div className="flex w-full flex-1 items-center justify-between gap-2">
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
