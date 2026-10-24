import type { ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";
import { createContext, use, useState } from "react";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

/**
 * The opacities of the views fading a message in: as it arrives (see
 * `Opening`) and as it's sent (see `SendingFade`).
 */
const FadingContext = createContext<readonly SharedValue<number>[]>([]);

/** Whether every one of `fades` has reached full opacity. */
function shownFully(fades: readonly SharedValue<number>[]) {
  "worklet";
  for (const opacity of fades) {
    if (opacity.value < 1) return false;
  }
  return true;
}

/** Adds `opacity` to the fades of everything inside it. */
export function Fading({
  opacity,
  children,
}: {
  opacity: SharedValue<number>;
  children: ReactNode;
}) {
  const outer = use(FadingContext);
  return <FadingContext value={[...outer, opacity]}>{children}</FadingContext>;
}

/**
 * Whether the message this is in is fully shown. Glass created under a
 * parent that's fading often doesn't draw, and stays blank until it's
 * created again (see `GlassSurface`): reactions under a message that's
 * still arriving or sending wait for this to bring their glass in.
 */
export function useOpaque() {
  const fades = use(FadingContext);
  const [opaque, setOpaque] = useState(() => shownFully(fades));
  useAnimatedReaction(
    () => shownFully(fades),
    (now, before) => {
      if (now !== before) scheduleOnRN(setOpaque, now);
    },
  );
  return opaque;
}
