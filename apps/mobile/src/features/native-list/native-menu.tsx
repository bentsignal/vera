import type { useListEvents } from "./use-list-events";
import { LiftedPreview } from "./lifted-preview";

type Menu = Parameters<typeof useListEvents>[0]["menu"];

/** Old binaries still draw the React preview; supported binaries lift real views. */
export function nativeMenu(options: Omit<Menu, "preview">) {
  return {
    ...options,
    preview: (message, held) => (
      <LiftedPreview
        message={message}
        held={held}
        layout={options.layout}
        isOwn={message.authorId === options.self}
      />
    ),
  } satisfies Menu;
}
