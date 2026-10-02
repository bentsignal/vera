import { Linking, Pressable, Text, View } from "react-native";

import type { LinkPreview } from "./types";
import { SymbolIcon } from "~/components/symbol-icon";

/** Open Graph preview. The image area is a placeholder until media loads. */
export function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(preview.url)}
      className="border-hairline border-separator bg-background-elevated w-64 overflow-hidden rounded-2xl active:opacity-80"
      style={{ borderCurve: "continuous" }}
    >
      <View className="bg-fill aspect-[1.91] items-center justify-center">
        <SymbolIcon
          name={{ ios: "link", android: "link" }}
          size={28}
          tintColorClassName="accent-subtle"
        />
      </View>
      <View className="gap-0.5 px-3 py-2.5">
        <Text className="text-caption text-muted uppercase">
          {preview.siteName}
        </Text>
        <Text
          numberOfLines={2}
          className="text-subhead text-foreground font-semibold"
        >
          {preview.title}
        </Text>
        <Text numberOfLines={2} className="text-footnote text-muted">
          {preview.description}
        </Text>
      </View>
    </Pressable>
  );
}
