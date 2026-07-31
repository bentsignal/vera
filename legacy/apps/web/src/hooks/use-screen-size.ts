import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1280;

type ScreenSize = "mobile" | "desktop" | "tablet";

function getScreenSize(width: number) {
  if (width < MOBILE_BREAKPOINT) return "mobile";
  if (width < TABLET_BREAKPOINT) return "tablet";
  return "desktop";
}

export function useScreenSize() {
  const [screenSize, setScreenSize] = useState<ScreenSize | undefined>(() =>
    typeof window !== "undefined"
      ? getScreenSize(window.innerWidth)
      : undefined,
  );

  // eslint-disable-next-line no-restricted-syntax -- Effect needed to subscribe to media query change events
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const tabletMql = window.matchMedia(
      `(max-width: ${TABLET_BREAKPOINT - 1}px)`,
    );
    function onChange() {
      setScreenSize(getScreenSize(window.innerWidth));
    }
    mql.addEventListener("change", onChange);
    tabletMql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
      tabletMql.removeEventListener("change", onChange);
    };
  }, []);

  return screenSize;
}
