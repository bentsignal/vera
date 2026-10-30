import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { GlassSurface } from "~/components/glass-surface";
import {
  BUTTON,
  GlassCircleButton,
  HeaderOfflinePill,
  TopEdge,
} from "./conversation-header";

/**
 * Height of the thread's header below the status bar. Replies rest below
 * it and scroll up behind it.
 */
export const THREAD_HEADER_HEIGHT = BUTTON + 8;

/**
 * A thread's header: a floating glass back button, "Thread" over the
 * conversation's name in the middle, which opens the conversation, and
 * the thread's bell, which turns its notifications off or back on.
 */
/**
 * Development only: the thread looks' switch (thread-looks.ts). Each step
 * names the look it went to for a moment, under the header.
 */
interface LookSwitch {
  /** Goes to the next look or the one before; returns its name. */
  onStep: (step: 1 | -1) => string;
  /** Holding the middle turns the pretend day earlier on or off. */
  onToggleYesterday: () => string;
}

/** What a look switch said last, shown for a moment. */
function useToast() {
  const [toast, setToast] = useState<{ text: string; key: number }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return {
    show: (text: string) => {
      clearTimeout(timer.current);
      setToast((last) => ({ key: (last?.key ?? 0) + 1, text }));
      timer.current = setTimeout(() => setToast(undefined), 1600);
    },
    toast,
  };
}

/** A look switch's last word, under the header. */
function Toast({ text, top }: { text: string; top: number }) {
  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(250)}
      className="absolute right-0 left-0 items-center"
      style={{ top: top + THREAD_HEADER_HEIGHT + 4 }}
    >
      <GlassSurface className="rounded-full px-4 py-2">
        <Text className="text-footnote text-foreground font-semibold">
          {text}
        </Text>
      </GlassSurface>
    </Animated.View>
  );
}

function LookStep({
  step,
  onStep,
}: {
  step: 1 | -1;
  onStep: (step: 1 | -1) => void;
}) {
  return (
    <GlassCircleButton
      icon={
        step === 1
          ? { android: "keyboard_double_arrow_right", ios: "chevron.right.2" }
          : { android: "keyboard_double_arrow_left", ios: "chevron.left.2" }
      }
      label={step === 1 ? "Next Thread Look" : "Previous Thread Look"}
      onPress={() => onStep(step)}
    />
  );
}

/** "Thread" over the conversation's name, which opens the conversation. */
function ThreadTitle({
  title,
  heading,
  onPress,
  onLongPress,
}: {
  title: string;
  heading: string;
  onPress: () => void;
  onLongPress: (() => void) | undefined;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title === "" ? "Thread" : `Thread in ${title}`}
      accessibilityHint="Opens the conversation"
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {({ pressed }) => (
        <GlassSurface
          className="items-center justify-center rounded-full px-4"
          style={{ height: BUTTON, maxWidth: 220 }}
        >
          {/* Dims what's on the glass, not the glass itself, which a
            parent's opacity breaks (see `GlassSurface`). */}
          <View className="items-center" style={{ opacity: pressed ? 0.7 : 1 }}>
            <Text className="text-subhead text-foreground font-semibold">
              {heading}
            </Text>
            {title !== "" && (
              <Animated.Text
                entering={FadeIn.duration(200)}
                numberOfLines={1}
                className="text-caption text-muted"
              >
                {title}
              </Animated.Text>
            )}
          </View>
        </GlassSurface>
      )}
    </Pressable>
  );
}

export function ThreadHeader({
  title,
  heading = "Thread",
  following,
  onOpenConversation,
  onToggleFollowing,
  lookSwitch,
}: {
  /** The conversation's name. */
  title: string;
  /** The middle's first line. */
  heading?: string;
  lookSwitch?: LookSwitch;
  /** Whether the bell is on; undefined until it has loaded. */
  following: boolean | undefined;
  onOpenConversation: () => void;
  onToggleFollowing: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { show, toast } = useToast();
  return (
    <>
      <TopEdge height={THREAD_HEADER_HEIGHT} />
      <HeaderOfflinePill height={THREAD_HEADER_HEIGHT} />
      <LayoutAnimationConfig skipEntering>
        <View
          // Drags between the buttons still scroll the replies beneath.
          pointerEvents="box-none"
          className="absolute right-0 left-0 flex-row items-center justify-between px-4"
          style={{ top: insets.top }}
        >
          <GlassCircleButton
            icon={{ android: "arrow_back", ios: "chevron.left" }}
            label="Back"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
          />
          <View className="flex-row items-center gap-2">
            {lookSwitch !== undefined && (
              <LookStep
                step={-1}
                onStep={(step) => show(lookSwitch.onStep(step))}
              />
            )}
            <ThreadTitle
              title={title}
              heading={heading}
              onPress={onOpenConversation}
              onLongPress={
                lookSwitch === undefined
                  ? undefined
                  : () => show(lookSwitch.onToggleYesterday())
              }
            />
            {lookSwitch !== undefined && (
              <LookStep
                step={1}
                onStep={(step) => show(lookSwitch.onStep(step))}
              />
            )}
          </View>
          <View style={{ width: BUTTON }}>
            {/* Once loaded, its glass materializes. */}
            {following !== undefined && (
              <GlassCircleButton
                materialize
                icon={
                  following
                    ? { android: "notifications", ios: "bell" }
                    : { android: "notifications_off", ios: "bell.slash" }
                }
                label={
                  following
                    ? "Turn Off Notifications for This Thread"
                    : "Turn On Notifications for This Thread"
                }
                onPress={onToggleFollowing}
              />
            )}
          </View>
        </View>
      </LayoutAnimationConfig>
      {toast !== undefined && (
        <Toast key={toast.key} text={toast.text} top={insets.top} />
      )}
    </>
  );
}
