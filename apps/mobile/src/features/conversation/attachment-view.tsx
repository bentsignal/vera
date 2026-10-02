import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import type { Attachment } from "./types";
import { SymbolIcon } from "~/components/symbol-icon";
import { formatBytes, formatDuration } from "~/lib/format";

const MEDIA_WIDTH = 240;
const MAX_MEDIA_HEIGHT = 300;

function mediaHeight({ height, width }: Attachment) {
  if (width === undefined || height === undefined || width === 0) {
    return MEDIA_WIDTH;
  }
  return Math.min(MAX_MEDIA_HEIGHT, (MEDIA_WIDTH * height) / width);
}

function Media({ attachment }: { attachment: Attachment }) {
  const router = useRouter();
  const isVideo = attachment.kind === "video";
  const poster = isVideo ? attachment.thumbnailUrl : attachment.url;
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={isVideo ? "Play video" : "View photo"}
      onPress={() =>
        router.push({
          params: { kind: attachment.kind, url: attachment.url },
          pathname: "/media",
        })
      }
      className="bg-fill items-center justify-center overflow-hidden rounded-2xl active:opacity-90"
      style={{
        borderCurve: "continuous",
        height: mediaHeight(attachment),
        width: MEDIA_WIDTH,
      }}
    >
      {poster !== undefined && (
        <Image
          source={{ uri: poster }}
          contentFit="cover"
          transition={150}
          style={{ height: "100%", position: "absolute", width: "100%" }}
        />
      )}
      {isVideo && (
        <>
          <SymbolIcon
            name={{ android: "play_circle", ios: "play.circle.fill" }}
            size={48}
            tintColorClassName="accent-white/90"
          />
          {attachment.durationMs !== undefined && (
            <Text className="text-caption absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 font-semibold text-white">
              {formatDuration(Math.round(attachment.durationMs / 1000))}
            </Text>
          )}
        </>
      )}
    </Pressable>
  );
}

function FileCard({ attachment }: { attachment: Attachment }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void WebBrowser.openBrowserAsync(attachment.url)}
      className="bg-bubble-incoming w-64 flex-row items-center gap-3 rounded-2xl p-3 active:opacity-80"
      style={{ borderCurve: "continuous" }}
    >
      <View className="bg-accent size-10 items-center justify-center rounded-lg">
        <SymbolIcon
          name={{ android: "description", ios: "doc.fill" }}
          size={20}
          tintColorClassName="accent-on-accent"
        />
      </View>
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className="text-subhead text-foreground font-semibold"
        >
          {attachment.name}
        </Text>
        <Text className="text-footnote text-muted">
          {formatBytes(attachment.size)}
        </Text>
      </View>
    </Pressable>
  );
}

export function AttachmentView({ attachment }: { attachment: Attachment }) {
  return attachment.kind === "file" ? (
    <FileCard attachment={attachment} />
  ) : (
    <Media attachment={attachment} />
  );
}
