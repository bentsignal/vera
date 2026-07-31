import { useSyncExternalStore } from "react";

function getPointerSnapshot() {
  const canHover = window.matchMedia("(hover: hover)").matches;
  const isCoarse = window.matchMedia("(pointer: coarse)").matches;

  if (!canHover || isCoarse) {
    return "touch";
  }

  return "hover";
}

function subscribeToPointerCapability(onStoreChange: () => void) {
  const hoverMediaQuery = window.matchMedia("(hover: hover)");
  const coarsePointerMediaQuery = window.matchMedia("(pointer: coarse)");

  hoverMediaQuery.addEventListener("change", onStoreChange);
  coarsePointerMediaQuery.addEventListener("change", onStoreChange);

  return () => {
    hoverMediaQuery.removeEventListener("change", onStoreChange);
    coarsePointerMediaQuery.removeEventListener("change", onStoreChange);
  };
}

function getServerSnapshot() {
  return undefined;
}

export function useHasTouch() {
  const capability = useSyncExternalStore(
    subscribeToPointerCapability,
    getPointerSnapshot,
    getServerSnapshot,
  );

  return {
    capability,
    isKnown: capability !== undefined,
    isTouchPrimary: capability === "touch",
    canHover: capability === "hover",
    isCoarse: capability === "touch",
  };
}
