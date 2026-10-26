import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { parseGroup } from "~/features/conversation/media-group";
import { MediaGroupViewer } from "~/features/conversation/media-group-viewer";
import { PhotoViewer } from "~/features/conversation/photo-viewer";
import { VideoViewer } from "~/features/conversation/video-viewer";
import { ViewerCloseButton } from "~/features/conversation/viewer-close-button";
import { markPhoto } from "~/features/dev/photo-timing";

/** The route has no animation of its own; the screen fades itself in. */
const FADE_IN = FadeIn.duration(200);

function CloseButton({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="absolute left-4" style={{ top: insets.top + 8 }}>
      <ViewerCloseButton onPress={onPress} />
    </View>
  );
}

/** The pixel size passed along with a photo, when its message had one. */
function photoSize(width?: string, height?: string) {
  const size = { height: Number(height), width: Number(width) };
  return size.width > 0 && size.height > 0 ? size : undefined;
}

/**
 * Full-screen photo or video from a message or the composer, or a
 * message's photos and videos (`group`, see `groupParam`), on `index`.
 */
export default function MediaScreen() {
  const router = useRouter();
  const { kind, url, width, height, group, index } = useLocalSearchParams<{
    kind: string;
    url: string;
    width?: string;
    height?: string;
    group?: string;
    index?: string;
  }>();
  const items = parseGroup(group);
  function onClose() {
    router.back();
  }
  return (
    <Animated.View
      entering={FADE_IN}
      style={StyleSheet.absoluteFill}
      onLayout={() => markPhoto("viewerLayout")}
    >
      {items !== undefined ? (
        <MediaGroupViewer
          items={items}
          start={Number(index ?? 0)}
          onClose={onClose}
        />
      ) : kind === "video" ? (
        <VideoViewer url={url} onClose={onClose} />
      ) : (
        <PhotoViewer
          url={url}
          size={photoSize(width, height)}
          onClose={onClose}
          chrome={(close) => <CloseButton onPress={close} />}
        />
      )}
    </Animated.View>
  );
}
