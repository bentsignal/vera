import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

// Today's date for labels such as "Yesterday · 9:14 PM", which go stale at
// midnight when nothing else re-renders them.

function startOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  function untilMidnight() {
    const midnight = new Date(startOfToday());
    midnight.setDate(midnight.getDate() + 1);
    // A second past, so the new day has begun when it fires.
    timer = setTimeout(
      () => {
        onChange();
        untilMidnight();
      },
      midnight.getTime() - Date.now() + 1000,
    );
  }
  untilMidnight();
  // Timers stop while the app is in the background; check on return.
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") onChange();
  });
  return () => {
    clearTimeout(timer);
    subscription.remove();
  };
}

/** The start of today, updating at midnight and when the app returns. */
export function useToday() {
  return new Date(useSyncExternalStore(subscribe, startOfToday));
}
