import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useRouter } from "expo-router";

import { GlassSurface } from "~/components/glass-surface";
import { usePending } from "~/components/pending";
import { SymbolIcon } from "~/components/symbol-icon";
import { useAccount, useVisibleAccounts } from "~/features/messaging/account";
import { useSession } from "~/features/session/session-provider";
import { cn } from "~/lib/cn";
import { useShowsOffline } from "./unanswered";
import { useAnswerDeadline } from "./use-saved-fallback";

/** The pill's height. */
const PILL = 28;

/** Whether Home says it can't connect: any account it shows. */
export function useHomeOffline() {
  return useShowsOffline(useVisibleAccounts().map(({ address }) => address));
}

/**
 * What Home's pill says: that an account it shows can't connect, or else
 * how many accounts' servers can't be reached (`UnreachablePill`).
 */
export function useHomePill() {
  const offline = useHomeOffline();
  const unreachable = useSession().unreachable.length;
  return { offline, shown: offline || unreachable > 0, unreachable };
}

/** Whether a screen of the current account says it can't connect. */
export function useAccountOffline() {
  return useShowsOffline([useAccount().address]);
}

/**
 * `usePending` for a screen of the current account, whose header has an
 * `OfflinePill`. Still loading at the deadline, it counts the account's
 * PDS as not answering, so the pill says so.
 */
export function useAccountPending(loading: boolean) {
  const { address } = useAccount();
  useAnswerDeadline(address, loading);
  return usePending(loading, useAccountOffline());
}

/**
 * A glass pill, centered `top` points down, saying the PDS isn't
 * answering (`useShowsOffline`), so what's on screen isn't mistaken for
 * live. It floats over a conversation's messages, which already pass under
 * its glass header; a list makes room for it instead (`ScreenList`'s
 * `offline`), so it doesn't cover the top row. On iOS the glass
 * materializes and dissolves (glass can't fade; see `GlassSurface`).
 */
export function OfflinePill({ shown, top }: { shown: boolean; top: number }) {
  return (
    <StatusPill shown={shown} top={top}>
      <Text
        accessibilityLiveRegion="polite"
        className="text-footnote text-foreground font-semibold"
      >
        Can't connect
        <Text className="text-muted font-normal"> · Retrying…</Text>
      </Text>
    </StatusPill>
  );
}

/**
 * Home's pill: that an account it shows can't connect, which is about
 * what's on screen, or else how many accounts' servers can't be reached.
 */
export function HomePill({ top }: { top: number }) {
  const { offline, unreachable } = useHomePill();
  return (
    <>
      <OfflinePill shown={offline} top={top} />
      <UnreachablePill
        count={unreachable}
        shown={!offline && unreachable > 0}
        top={top}
      />
    </>
  );
}

/**
 * Home's pill while accounts' servers can't be reached (`unreachable` in
 * the session): how many, opening More, which lists them in red.
 */
export function UnreachablePill({
  count,
  shown,
  top,
}: {
  count: number;
  shown: boolean;
  top: number;
}) {
  const router = useRouter();
  return (
    <StatusPill
      shown={shown}
      top={top}
      onPress={() => router.navigate("/more")}
    >
      <View className="flex-row items-center gap-1">
        <Text
          accessibilityLiveRegion="polite"
          className="text-footnote text-foreground font-semibold"
        >
          {count === 1
            ? "Can't reach 1 account"
            : `Can't reach ${count} accounts`}
        </Text>
        <SymbolIcon
          name={{ android: "chevron_right", ios: "chevron.right" }}
          size={11}
          weight="semibold"
          tintColorClassName="accent-muted"
        />
      </View>
    </StatusPill>
  );
}

function StatusPill({
  children,
  onPress,
  shown,
  top,
}: {
  children: ReactNode;
  onPress?: () => void;
  shown: boolean;
  top: number;
}) {
  return (
    <View
      pointerEvents={shown && onPress !== undefined ? "box-none" : "none"}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
      className="absolute right-0 left-0 items-center"
      style={{ top }}
    >
      {onPress === undefined ? (
        <PillSurface shown={shown}>{children}</PillSurface>
      ) : (
        <Pressable accessibilityRole="button" onPress={onPress}>
          <PillSurface shown={shown}>{children}</PillSurface>
        </Pressable>
      )}
    </View>
  );
}

function PillSurface({
  children,
  shown,
}: {
  children: ReactNode;
  shown: boolean;
}) {
  return (
    <GlassSurface
      shown={shown}
      className="justify-center rounded-full px-3.5"
      androidClassName={cn(
        "bg-background-elevated border-hairline border-separator shadow-sm",
        !shown && "opacity-0",
      )}
      style={{ height: PILL }}
    >
      <Animated.View
        style={{
          opacity: shown ? 1 : 0,
          transitionDuration: 200,
          transitionProperty: "opacity",
        }}
      >
        {children}
      </Animated.View>
    </GlassSurface>
  );
}
