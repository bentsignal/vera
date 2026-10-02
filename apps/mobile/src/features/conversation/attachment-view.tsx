import { Text, View } from "react-native";

import type { Attachment } from "./types";
import { SymbolIcon } from "~/components/symbol-icon";
import { cn } from "~/lib/cn";
import { formatBytes, formatDuration } from "~/lib/format";

const MEDIA_WIDTH = 240;

function mediaHeight(width: number, height: number) {
  return Math.min(300, (MEDIA_WIDTH * height) / width);
}

function MediaPlaceholder({
  attachment,
}: {
  attachment: Extract<Attachment, { kind: "image" | "video" }>;
}) {
  const isVideo = attachment.kind === "video";
  return (
    <View
      className={cn(
        "items-center justify-center overflow-hidden rounded-2xl",
        isVideo ? "bg-neutral-800" : "bg-fill",
      )}
      style={{
        width: MEDIA_WIDTH,
        height: mediaHeight(attachment.width, attachment.height),
        borderCurve: "continuous",
      }}
    >
      <SymbolIcon
        name={
          isVideo
            ? { ios: "play.circle.fill", android: "play_circle" }
            : { ios: "photo", android: "image" }
        }
        size={isVideo ? 48 : 36}
        tintColorClassName={isVideo ? "accent-white/80" : "accent-subtle"}
      />
      {isVideo && (
        <Text className="text-caption absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 font-semibold text-white">
          {formatDuration(attachment.durationSeconds)}
        </Text>
      )}
    </View>
  );
}

function FileCard({
  attachment,
}: {
  attachment: Extract<Attachment, { kind: "file" }>;
}) {
  return (
    <View
      className="bg-bubble-incoming w-64 flex-row items-center gap-3 rounded-2xl p-3"
      style={{ borderCurve: "continuous" }}
    >
      <View className="bg-accent size-10 items-center justify-center rounded-lg">
        <SymbolIcon
          name={{ ios: "doc.fill", android: "description" }}
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
          {formatBytes(attachment.sizeBytes)}
        </Text>
      </View>
    </View>
  );
}

export function AttachmentView({ attachment }: { attachment: Attachment }) {
  return attachment.kind === "file" ? (
    <FileCard attachment={attachment} />
  ) : (
    <MediaPlaceholder attachment={attachment} />
  );
}
