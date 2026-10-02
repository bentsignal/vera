import { createContext, use } from "react";

/** Set while a message is drawn lifted above the long-press overlay. */
export const LiftedContext = createContext(false);

/**
 * Whether this message is the lifted copy in the long-press overlay, where
 * details drawn against the page (like the bubble tail's cutout) are left off.
 */
export function useIsLifted() {
  return use(LiftedContext);
}
