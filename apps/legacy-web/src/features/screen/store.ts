import { useEffect, useState } from "react";
import { createStore } from "rostra";

import type { ScreenSizeValue } from "./sizes";
import { SCREEN_ORDER } from "./sizes";
import { getScreenSizeFromWidth } from "./utils";

function useInternalStore() {
  const [size, setSize] = useState<ScreenSizeValue | undefined>(undefined);

  // eslint-disable-next-line no-restricted-syntax -- syncs screen size with window resize, an external browser API
  useEffect(() => {
    function syncScreenSize() {
      setSize(getScreenSizeFromWidth(window.innerWidth));
    }

    syncScreenSize();
    window.addEventListener("resize", syncScreenSize);

    return () => {
      window.removeEventListener("resize", syncScreenSize);
    };
  }, []);

  function isBiggerThan(target: ScreenSizeValue) {
    return size !== undefined && SCREEN_ORDER[size] >= SCREEN_ORDER[target];
  }

  function isSmallerThan(target: ScreenSizeValue) {
    return size !== undefined && SCREEN_ORDER[size] <= SCREEN_ORDER[target];
  }

  return {
    screen: {
      size,
      isBiggerThan,
      isSmallerThan,
    },
  };
}

export const { Store: ScreenStore, useStore: useScreenStore } =
  createStore(useInternalStore);
