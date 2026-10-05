import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";

import { SymbolIcon } from "~/components/symbol-icon";
import { PhotoViewer } from "~/features/conversation/photo-viewer";

function Video({ url }: { url: string }) {
  const player = useVideoPlayer(url, (instance) => instance.play());
  return (
    <VideoView
      player={player}
      nativeControls
      allowsPictureInPicture
      contentFit="contain"
      style={{ flex: 1 }}
    />
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={onPress}
      className="absolute left-4 size-9 items-center justify-center rounded-full bg-black/50"
      style={{ top: insets.top + 8 }}
    >
      <SymbolIcon
        name={{ android: "close", ios: "xmark" }}
        size={16}
        tintColorClassName="accent-white"
      />
    </Pressable>
  );
}

/** The pixel size passed along with a photo, when its message had one. */
function photoSize(width?: string, height?: string) {
  const size = { height: Number(height), width: Number(width) };
  return size.width > 0 && size.height > 0 ? size : undefined;
}

/** Full-screen photo or video from a message. */
export default function MediaScreen() {
  const router = useRouter();
  const { kind, url, width, height } = useLocalSearchParams<{
    kind: string;
    url: string;
    width?: string;
    height?: string;
  }>();
  if (kind === "video") {
    return (
      <View className="flex-1 bg-black">
        <Video url={url} />
        <CloseButton onPress={() => router.back()} />
      </View>
    );
  }
  return (
    <View className="flex-1">
      <PhotoViewer
        url={url}
        size={photoSize(width, height)}
        onClose={() => router.back()}
        chrome={<CloseButton onPress={() => router.back()} />}
      />
    </View>
  );
}
