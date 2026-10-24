import type { SharedValue } from "react-native-reanimated";
import { useState } from "react";
import { useAnimatedReaction, useAnimatedStyle } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

/**
 * A view's height from `height` on the UI thread, held in React too.
 *
 * React's own props for an animated view are the styles it rendered with.
 * Reanimated draws the animated value over them, and copies it back into
 * React only when the JavaScript thread checks in time; it forgets values
 * older than two seconds whether it copied them or not. When that thread
 * is busy (several messages arriving at once), the view's next render puts
 * the height it was first drawn with back: a space for who's typing or for
 * reactions that's open when it should be closed, or closed when it should
 * be open, and the whole thread off by as much until it changes again.
 * Giving React each height too keeps its props current.
 */
export function useHeldHeight(height: SharedValue<number>) {
  const [held, setHeld] = useState(() => height.get());
  useAnimatedReaction(
    () => height.get(),
    (now, before) => {
      if (now !== before) scheduleOnRN(setHeld, now);
    },
  );
  // eslint-disable-next-line vera/no-layout-animation -- Not animated: the height changes once, in the same frame as the moves, which do the moving.
  const style = useAnimatedStyle(() => ({ height: height.get() }));
  return [{ height: held }, style];
}
