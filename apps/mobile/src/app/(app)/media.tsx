import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";

import { SymbolIcon } from "~/components/symbol-icon";

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

/** Full-screen photo or video from a message. */
export default function MediaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kind, url } = useLocalSearchParams<{ kind: string; url: string }>();
  return (
    <View className="flex-1 bg-black">
      {kind === "video" ? (
        <Video url={url} />
      ) : (
        <Image source={{ uri: url }} contentFit="contain" style={{ flex: 1 }} />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => router.back()}
        className="absolute left-4 size-9 items-center justify-center rounded-full bg-black/50"
        style={{ top: insets.top + 8 }}
      >
        <SymbolIcon
          name={{ android: "close", ios: "xmark" }}
          size={16}
          tintColorClassName="accent-white"
        />
      </Pressable>
    </View>
  );
}
