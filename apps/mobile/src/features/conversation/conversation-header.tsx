import type { SymbolViewProps } from "expo-symbols";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useCSSVariable } from "uniwind";

import type { ConversationKind } from "~/features/inbox/types";
import { Avatar } from "~/components/avatar";
import { GlassSurface } from "~/components/glass-surface";
import { SymbolIcon } from "~/components/symbol-icon";

/** Matches the native glass bar buttons. */
const BUTTON = 44;
const AVATAR = 52;
/** How far the name capsule tucks up under the photo, as in Messages. */
const CAPSULE_OVERLAP = 6;
const CAPSULE = 26;

/**
 * Height of the header below the status bar. Messages rest below it and
 * scroll up behind it.
 */
export const CONVERSATION_HEADER_HEIGHT =
  AVATAR + CAPSULE - CAPSULE_OVERLAP + 8;

const CHANNEL_GLYPH = { android: "tag", ios: "number" } as const;

/** How far below the status bar the soft edge reaches. */
const EDGE = 14;

/**
 * A soft edge behind the status bar only, like the system's scroll edge
 * effect: messages reach up behind the photo and name, and just the clock
 * and battery stay clear of them.
 */
function TopEdge() {
  const insets = useSafeAreaInsets();
  const color = useCSSVariable("--color-background");
  if (Platform.OS === "android") return <AndroidBar />;
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) {
    return null;
  }
  const height = insets.top + EDGE;
  const solid = Math.round(((insets.top * 0.6) / height) * 100);
  return (
    <View
      pointerEvents="none"
      className="absolute top-0 right-0 left-0"
      style={{
        experimental_backgroundImage: `linear-gradient(180deg, ${color}e6 0%, ${color}b3 ${solid}%, ${color}00 100%)`,
        height,
      }}
    />
  );
}

/**
 * Android has no glass to read messages through, so the header sits on a
 * solid bar with a hairline, like a Material top app bar.
 */
function AndroidBar() {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      className="bg-background border-separator absolute top-0 right-0 left-0"
      style={{
        borderBottomWidth: StyleSheet.hairlineWidth,
        height: insets.top + CONVERSATION_HEADER_HEIGHT + 6,
      }}
    />
  );
}

function GlassCircleButton({
  icon,
  label,
  onPress,
}: {
  icon: SymbolViewProps["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
    >
      <GlassSurface
        isInteractive
        className="items-center justify-center rounded-full"
        style={{ height: BUTTON, width: BUTTON }}
      >
        <SymbolIcon
          name={icon}
          size={19}
          weight="semibold"
          tintColorClassName="accent-foreground"
        />
      </GlassSurface>
    </Pressable>
  );
}

/** The photo, `#` for channels, or initials, cross-fading as data loads. */
function HeaderAvatar({
  title,
  kind,
  avatarUrl,
}: {
  title: string;
  kind: ConversationKind | undefined;
  avatarUrl: string | null;
}) {
  const isChannel = kind === "channel" || title.startsWith("#");
  return (
    <View style={{ height: AVATAR, width: AVATAR }}>
      <Animated.View
        key={isChannel ? "channel" : title}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        className="absolute"
      >
        <Avatar
          name={title}
          size="header"
          uri={avatarUrl}
          glyph={isChannel ? CHANNEL_GLYPH : undefined}
        />
      </Animated.View>
    </View>
  );
}

/** The name in a glass capsule with a chevron, tucked under the photo. */
function NameCapsule({ title }: { title: string }) {
  if (title === "") return null;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{ marginTop: -CAPSULE_OVERLAP }}
    >
      <GlassSurface
        className="flex-row items-center gap-1 rounded-full px-2.5"
        style={{ height: CAPSULE, maxWidth: 220 }}
      >
        <Text
          numberOfLines={1}
          className="text-footnote text-foreground shrink font-semibold"
        >
          {title}
        </Text>
        <SymbolIcon
          name={{ android: "chevron_right", ios: "chevron.right" }}
          size={9}
          weight="bold"
          tintColorClassName="accent-muted"
        />
      </GlassSurface>
    </Animated.View>
  );
}

/**
 * iMessage's conversation header: a floating glass back button, the photo
 * and name centered under the Dynamic Island, and an info button. Messages
 * scroll up behind it, under the glass. Anything that loads later fades
 * in; what is known when the screen opens shows right away.
 */
export function ConversationHeader({
  title,
  kind,
  avatarUrl,
  onOpenInfo,
}: {
  title: string;
  kind?: ConversationKind;
  /** The other person's photo in a direct conversation. */
  avatarUrl: string | null;
  /** Omitted when there is nothing to show, such as a missing conversation. */
  onOpenInfo?: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <>
      <TopEdge />
      <LayoutAnimationConfig skipEntering>
        <View
          // Drags between the buttons still scroll the messages beneath.
          pointerEvents="box-none"
          className="absolute right-0 left-0 flex-row items-start justify-between px-4"
          style={{ top: insets.top }}
        >
          <View style={{ marginTop: (AVATAR - BUTTON) / 2 }}>
            <GlassCircleButton
              icon={{ android: "arrow_back", ios: "chevron.left" }}
              label="Back"
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace("/");
              }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}, details`}
            disabled={onOpenInfo === undefined}
            onPress={onOpenInfo}
            className="items-center active:opacity-70"
          >
            <HeaderAvatar title={title} kind={kind} avatarUrl={avatarUrl} />
            <NameCapsule title={title} />
          </Pressable>
          <View style={{ marginTop: (AVATAR - BUTTON) / 2, width: BUTTON }}>
            {onOpenInfo !== undefined && (
              <GlassCircleButton
                icon={{ android: "info", ios: "info" }}
                label="Details"
                onPress={onOpenInfo}
              />
            )}
          </View>
        </View>
      </LayoutAnimationConfig>
    </>
  );
}
