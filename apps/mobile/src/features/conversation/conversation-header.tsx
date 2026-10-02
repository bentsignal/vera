import type { SymbolViewProps } from "expo-symbols";
import { Pressable, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassView } from "expo-glass-effect";
import { useRouter } from "expo-router";
import { withUniwind } from "uniwind";

import type { ConversationKind } from "~/features/inbox/types";
import { Avatar } from "~/components/avatar";
import { HeaderFade } from "~/components/header-fade";
import { SymbolIcon } from "~/components/symbol-icon";

const StyledGlassView = withUniwind(GlassView);

/** Matches the native glass bar buttons. */
const BUTTON = 44;
const AVATAR = 52;
/** How far the name capsule tucks up under the photo, as in Messages. */
const CAPSULE_OVERLAP = 6;
const CAPSULE = 26;

/** How far the fade behind the header reaches past the name capsule. */
const FADE_PAST = 12;

/**
 * Height of the header below the status bar, through the end of its fade.
 * Content resting below it is never dimmed.
 */
export const CONVERSATION_HEADER_HEIGHT =
  AVATAR + CAPSULE - CAPSULE_OVERLAP + FADE_PAST;

const CHANNEL_GLYPH = { android: "tag", ios: "number" } as const;

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
      <StyledGlassView
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
      </StyledGlassView>
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
      <StyledGlassView
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
      </StyledGlassView>
    </Animated.View>
  );
}

/**
 * iMessage's conversation header: a floating glass back button, the photo
 * and name centered under the Dynamic Island, and an info button. Messages
 * scroll underneath and fade out behind it. Anything that loads later fades
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
      {/* Solid behind the status bar, fading out across the header. */}
      <HeaderFade barHeight={16} fade={CONVERSATION_HEADER_HEIGHT - 16} />
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
