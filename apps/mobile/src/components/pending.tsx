import { useEffect, useEffectEvent, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { anyShownOffline } from "~/features/saved/unanswered";
import { cn } from "~/lib/cn";

/** How long a screen shows nothing while it loads, before a spinner. */
const PENDING_MS = 1000;
/**
 * How long the spinner stays once shown, even if the screen loads sooner,
 * so it never flickers in and straight back out.
 */
const PENDING_MIN_MS = 1000;
/** How long a screen loads before it says something is wrong. */
const TROUBLE_MS = 6000;

/**
 * Whether a loading screen is ready to show its content, and if not, what
 * shows meanwhile (`Pending`): nothing at first, since most screens load
 * within `PENDING_MS`; then a spinner, kept for at least `PENDING_MIN_MS`;
 * then word that it can't connect. That comes with the spinner if screens
 * already say an account can't connect (`unanswered.ts`), and never while
 * the screen's own `OfflinePill` says it (`offline`).
 */
export function usePending(loading: boolean, offline = false) {
  const [spinnerAt, setSpinnerAt] = useState<number>();
  const [holding, setHolding] = useState(false);
  const [trouble, setTrouble] = useState(false);
  const showSpinner = useEffectEvent(() => {
    setSpinnerAt(Date.now());
    setHolding(true);
    if (anyShownOffline()) setTrouble(true);
  });
  // eslint-disable-next-line no-restricted-syntax -- How long a screen has been loading only a timer started as it starts can measure.
  useEffect(() => {
    if (!loading) return;
    const spinner = setTimeout(showSpinner, PENDING_MS);
    const troubleTimer = setTimeout(() => setTrouble(true), TROUBLE_MS);
    return () => {
      clearTimeout(spinner);
      clearTimeout(troubleTimer);
    };
  }, [loading]);
  // eslint-disable-next-line no-restricted-syntax -- The spinner's minimum time counts from when it appeared, which only a timer started then can measure.
  useEffect(() => {
    if (spinnerAt === undefined) return;
    const timer = setTimeout(() => setHolding(false), PENDING_MIN_MS);
    return () => clearTimeout(timer);
  }, [spinnerAt]);
  if (!loading && !holding) return "ready";
  if (spinnerAt === undefined) return "blank";
  return trouble && !offline ? "trouble" : "spinner";
}

/**
 * What a loading screen shows meanwhile (`usePending`): centered, or at
 * the `top` of a list, where its rows would start. The words below the
 * spinner have their place from the start, so the spinner doesn't move
 * when they fade in.
 */
export function Pending({
  phase,
  top = false,
}: {
  phase: ReturnType<typeof usePending>;
  top?: boolean;
}) {
  if (phase === "ready" || phase === "blank") return null;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      className={cn(
        "items-center gap-4 px-8",
        top ? "pt-12" : "absolute inset-0 justify-center",
      )}
      pointerEvents="none"
    >
      {!top && <View className="h-12" />}
      {/* At the top of a list, between the small spinner and the large. */}
      <ActivityIndicator style={top && { transform: [{ scale: 1.3 }] }} />
      <Animated.View
        className="h-12 items-center gap-1"
        style={{
          opacity: phase === "trouble" ? 1 : 0,
          transitionDuration: 300,
          transitionProperty: "opacity",
        }}
      >
        <Text className="text-headline text-foreground font-semibold">
          Can't Connect
        </Text>
        <Text className="text-subhead text-muted text-center">Retrying…</Text>
      </Animated.View>
    </Animated.View>
  );
}
