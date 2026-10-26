import { Keyboard, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  withTiming,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { useRouter } from "expo-router";

import type { StagedFile } from "~/features/messaging/attachments";
import { GesturePressable } from "~/components/gesture-pressable";
import { SymbolIcon } from "~/components/symbol-icon";
import { formatBytes, formatDuration } from "~/lib/format";

const TILE = 64;
const GAP = 8;
/** The tiles plus the space above them. */
const STRIP_HEIGHT = TILE + GAP;

function RemoveButton({
  file,
  onPress,
}: {
  file: StagedFile;
  onPress: () => void;
}) {
  return (
    <GesturePressable
      accessibilityRole="button"
      accessibilityLabel={`Remove ${file.name}`}
      onPress={onPress}
      hitSlop={8}
      className="absolute top-1 right-1 size-[22px] items-center justify-center rounded-full bg-black/60"
      pressedClassName="opacity-70"
    >
      <SymbolIcon
        name={{ android: "close", ios: "xmark" }}
        size={10}
        weight="bold"
        tintColorClassName="accent-white"
      />
    </GesturePressable>
  );
}

/** A photo or video thumbnail; tapping it opens the full-screen viewer. */
function MediaTile({ file }: { file: StagedFile }) {
  const router = useRouter();
  const preview = file.kind === "video" ? file.poster?.uri : file.uri;
  return (
    <GesturePressable
      accessibilityRole="imagebutton"
      accessibilityLabel={file.kind === "video" ? "Video" : "Photo"}
      onPress={() => {
        // The keyboard would stay up over the viewer.
        Keyboard.dismiss();
        router.push({
          params: {
            height: file.height,
            kind: file.kind,
            url: file.uri,
            width: file.width,
          },
          pathname: "/media",
        });
      }}
      className="bg-fill overflow-hidden rounded-xl"
      pressedClassName="opacity-90"
      style={{ borderCurve: "continuous", height: TILE, width: TILE }}
    >
      {preview !== undefined && (
        <Image
          source={{ uri: preview }}
          contentFit="cover"
          style={{ height: "100%", width: "100%" }}
        />
      )}
      {file.kind === "video" && (
        <View className="absolute bottom-1 left-1 flex-row items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-px">
          <SymbolIcon
            name={{ android: "videocam", ios: "video.fill" }}
            size={9}
            tintColorClassName="accent-white"
          />
          {file.durationMs !== undefined && (
            <Text className="text-[11px] font-semibold text-white">
              {formatDuration(Math.round(file.durationMs / 1000))}
            </Text>
          )}
        </View>
      )}
    </GesturePressable>
  );
}

function FileTile({ file }: { file: StagedFile }) {
  return (
    <View
      className="bg-fill flex-row items-center gap-2 rounded-xl pr-8 pl-2.5"
      style={{ borderCurve: "continuous", height: TILE, width: 176 }}
    >
      <View className="bg-accent size-9 items-center justify-center rounded-lg">
        <SymbolIcon
          name={{ android: "description", ios: "doc.fill" }}
          size={17}
          tintColorClassName="accent-on-accent"
        />
      </View>
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className="text-footnote text-foreground font-semibold"
        >
          {file.name}
        </Text>
        <Text className="text-caption text-muted">
          {formatBytes(file.size)}
        </Text>
      </View>
    </View>
  );
}

function StagedTile({
  file,
  onRemove,
}: {
  file: StagedFile;
  onRemove: () => void;
}) {
  return (
    <Animated.View
      entering={ZoomIn.duration(200).withInitialValues({
        transform: [{ scale: 0.6 }],
      })}
      exiting={ZoomOut.duration(160)}
    >
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
      >
        {file.kind === "file" ? (
          <FileTile file={file} />
        ) : (
          <MediaTile file={file} />
        )}
        <RemoveButton file={file} onPress={onRemove} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * What's attached to the message being written, above its text: photo and
 * video thumbnails and file chips, each with a remove button. It opens and
 * closes with its first and last item, and shows nothing while a picker is
 * open: items appear once they're ready to send.
 */
export function StagedAttachments({
  files,
  onRemove,
}: {
  files: readonly StagedFile[];
  onRemove: (id: string) => void;
}) {
  const open = files.length > 0;
  const style = useAnimatedStyle(() => ({
    // eslint-disable-next-line vera/no-layout-animation -- Known: re-lays out the composer, and the list under it, on each frame; to be fixed in its own PR.
    height: withTiming(open ? STRIP_HEIGHT : 0, { duration: 220 }),
    opacity: withTiming(open ? 1 : 0, { duration: 180 }),
  }));
  return (
    <Animated.View style={[{ overflow: "hidden" }, style]}>
      <Animated.FlatList
        horizontal
        data={files}
        keyExtractor={(file) => file.id}
        renderItem={({ item }) => (
          <StagedTile file={item} onRemove={() => onRemove(item.id)} />
        )}
        itemLayoutAnimation={LinearTransition.duration(200)}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{
          gap: GAP,
          paddingHorizontal: GAP,
          paddingTop: GAP,
        }}
      />
    </Animated.View>
  );
}
