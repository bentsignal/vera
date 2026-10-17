import type { MessageLayout } from "~/features/preferences/store";

// How much room a typing indicator takes (see `typing-indicator.tsx`).

/**
 * The space the indicator takes under the newest message, the same as a
 * one-line message starting a run: when the typing becomes that message,
 * it lands right where the indicator was, and nothing moves.
 */
export const BUBBLE_SPACE = { bottom: 7, bubble: 38, top: 14 };
export const STACKED_SPACE = { bottom: 2, line: 20, top: 10 };

/** How tall the space for the indicator is, while anyone types. */
export function typingSpaceHeight(layout: MessageLayout, typing: boolean) {
  if (!typing) return 0;
  return layout === "stacked"
    ? STACKED_SPACE.top + STACKED_SPACE.line + STACKED_SPACE.bottom
    : BUBBLE_SPACE.top + BUBBLE_SPACE.bubble + BUBBLE_SPACE.bottom;
}

/**
 * The height `BelowNewest` changes with: when it grows (someone starts
 * typing, or the composer grows), the list follows it into view.
 */
export function belowNewestHeight({
  composerHeight,
  layout,
  typists,
}: {
  composerHeight: number;
  layout: MessageLayout;
  typists: readonly string[];
}) {
  return composerHeight + typingSpaceHeight(layout, typists.length > 0);
}
