import type { SharedValue } from "react-native-reanimated";
import { useRef, useState } from "react";
import { Easing, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { MenuTarget } from "./glass-message-menu";

/** Android keeps the modal until its source window has drawn the landing. */
export function useMenuClosing(
  progress: SharedValue<number>,
  target: MenuTarget,
  onClosing: (() => void) | undefined,
  onClosed: (backToChat: boolean) => void,
) {
  const started = useRef(false);
  const [closing, setClosing] = useState(false);
  function close(then?: () => void, toChat?: boolean) {
    if (started.current) return;
    started.current = true;
    const backToChat = toChat ?? then === undefined;
    onClosing?.();
    // Start native landing before the fade, and handle rejection immediately
    // if the source was removed while the menu was open.
    const landed = target.lift?.onLand()?.catch(() => undefined);
    function closed() {
      onClosed(backToChat);
      then?.();
    }
    function faded() {
      if (landed === undefined) closed();
      else void landed.then(closed);
    }
    setClosing(true);
    progress.set(
      withTiming(
        0,
        { duration: 240, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished === true) scheduleOnRN(faded);
        },
      ),
    );
  }
  return { close, closing };
}
