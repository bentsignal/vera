import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";

import type { LinkPreview } from "./types";

/** Open Graph preview fetched by the server after a link is sent. */
export function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void WebBrowser.openBrowserAsync(preview.url)}
      className="border-hairline border-separator bg-background-elevated w-64 overflow-hidden rounded-2xl active:opacity-80"
      style={{ borderCurve: "continuous" }}
    >
      {preview.imageUrl !== undefined && (
        <Image
          source={{ uri: preview.imageUrl }}
          contentFit="cover"
          transition={150}
          style={{ aspectRatio: 1.91, width: "100%" }}
        />
      )}
      <View className="gap-0.5 px-3 py-2.5">
        {preview.siteName !== undefined && (
          <Text numberOfLines={1} className="text-caption text-muted uppercase">
            {preview.siteName}
          </Text>
        )}
        {preview.title !== undefined && (
          <Text
            numberOfLines={2}
            className="text-subhead text-foreground font-semibold"
          >
            {preview.title}
          </Text>
        )}
        {preview.description !== undefined && (
          <Text numberOfLines={2} className="text-footnote text-muted">
            {preview.description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
