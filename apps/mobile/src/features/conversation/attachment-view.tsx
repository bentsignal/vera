import type { View as NativeView } from "react-native";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as VideoThumbnails from "expo-video-thumbnails";
// eslint-disable-next-line no-restricted-imports -- A poster drawn from a video file has no route loader to preload it from.
import { useQuery } from "@tanstack/react-query";

import type { AttachmentUpload, MessageAttachment } from "./types";
import { SymbolIcon } from "~/components/symbol-icon";
import { formatBytes, formatDuration } from "~/lib/format";
import { openLink } from "~/lib/open-link";
import { useMenuTarget } from "./message-actions";
import { showUploadProblem } from "./upload-problem";

const MEDIA_WIDTH = 240;
const MAX_MEDIA_HEIGHT = 300;
/**
 * A message's media and files pulse gently, all together, until the whole
 * message is sent, then fade up to full, instead of a progress ring per
 * item. (The message as a whole is dimmed a little while sending too; see
 * `SendingFade`.)
 */
const FADE_MS = 300;
const PULSE = { from: { opacity: 0.8 }, to: { opacity: 1 } };

function uploadFade(uploading: boolean) {
  if (uploading) {
    return {
      animationDirection: "alternate",
      animationDuration: 1400,
      animationIterationCount: "infinite",
      animationName: PULSE,
      animationTimingFunction: "ease-in-out",
    } as const;
  }
  return {
    opacity: 1,
    transitionDuration: FADE_MS,
    transitionProperty: "opacity",
    transitionTimingFunction: "ease-in-out",
  } as const;
}

function mediaHeight({ height, width }: MessageAttachment) {
  if (width === undefined || height === undefined || width === 0) {
    return MEDIA_WIDTH;
  }
  return Math.min(MAX_MEDIA_HEIGHT, (MEDIA_WIDTH * height) / width);
}

function isStuck(upload: AttachmentUpload | undefined) {
  return upload?.state === "failed" || upload?.state === "too-large";
}

function RetryBadge() {
  return (
    <View className="size-11 items-center justify-center rounded-full bg-black/55">
      <SymbolIcon
        name={{ android: "refresh", ios: "arrow.clockwise" }}
        size={20}
        weight="semibold"
        tintColorClassName="accent-white"
      />
    </View>
  );
}

/** The first frame of a video sent without a poster, drawn on this device. */
function useDrawnPoster(url: string, enabled: boolean) {
  const { data } = useQuery({
    enabled,
    gcTime: Number.POSITIVE_INFINITY,
    queryFn: () =>
      VideoThumbnails.getThumbnailAsync(url, { quality: 0.7, time: 0 }),
    queryKey: ["video-poster", url],
    retry: false,
    select: (frame) => frame.uri,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return data;
}

/** What a photo or video shows in the conversation. */
function usePoster(attachment: MessageAttachment) {
  const isVideo = attachment.kind === "video";
  const saved = isVideo
    ? (attachment.localThumbnailUrl ?? attachment.thumbnailUrl)
    : (attachment.localUrl ?? attachment.url);
  const drawn = useDrawnPoster(attachment.url, isVideo && saved === undefined);
  return saved ?? drawn;
}

function mediaLabel(attachment: MessageAttachment) {
  if (isStuck(attachment.upload)) return "Not uploaded. Try again or remove.";
  return attachment.kind === "video" ? "Play video" : "View photo";
}

/** What covers the media: a retry badge, or play once it's sent. */
function MediaBadge({ attachment }: { attachment: MessageAttachment }) {
  const { upload } = attachment;
  if (upload?.state === "uploading") return null;
  if (isStuck(upload)) return <RetryBadge />;
  if (attachment.kind !== "video") return null;
  return <PlayBadge />;
}

/** The play button over a video's poster. */
export function PlayBadge() {
  return (
    <View className="size-12 items-center justify-center rounded-full bg-black/40">
      <SymbolIcon
        name={{ android: "play_arrow", ios: "play.fill" }}
        size={24}
        tintColorClassName="accent-white"
      />
    </View>
  );
}

/** A video's length, in the poster's corner. */
export function DurationBadge({ durationMs }: { durationMs: number }) {
  return (
    <Text className="text-caption absolute bottom-2 left-2 overflow-hidden rounded-full bg-black/50 px-2 py-0.5 font-semibold text-white">
      {formatDuration(Math.round(durationMs / 1000))}
    </Text>
  );
}

function Media({
  attachment,
  sending,
}: {
  attachment: MessageAttachment;
  sending: boolean;
}) {
  const router = useRouter();
  const ref = useRef<NativeView>(null);
  const target = useMenuTarget({
    attachment,
    measured: ref,
    preview: <Media attachment={attachment} sending={sending} />,
    shape: "plain",
  });
  const { upload } = attachment;
  const isVideo = attachment.kind === "video";
  const poster = usePoster(attachment);
  return (
    <Pressable
      ref={ref}
      {...target?.press}
      accessibilityRole="imagebutton"
      accessibilityLabel={mediaLabel(attachment)}
      onPress={() => {
        if (upload !== undefined && isStuck(upload)) {
          showUploadProblem(upload);
          return;
        }
        router.push({
          params: {
            height: attachment.height,
            kind: attachment.kind,
            url: attachment.localUrl ?? attachment.url,
            width: attachment.width,
          },
          pathname: "/media",
        });
      }}
    >
      <Animated.View
        className="bg-fill items-center justify-center overflow-hidden rounded-2xl"
        style={[
          {
            borderCurve: "continuous",
            height: mediaHeight(attachment),
            width: MEDIA_WIDTH,
          },
          target?.style,
        ]}
      >
        {poster !== undefined && (
          <Animated.View
            style={[
              { height: "100%", position: "absolute", width: "100%" },
              uploadFade(sending),
            ]}
          >
            <Image
              source={{ uri: poster }}
              contentFit="cover"
              transition={150}
              style={{ height: "100%", width: "100%" }}
            />
          </Animated.View>
        )}
        <MediaBadge attachment={attachment} />
        {isVideo && attachment.durationMs !== undefined && (
          <DurationBadge durationMs={attachment.durationMs} />
        )}
      </Animated.View>
    </Pressable>
  );
}

function FileCard({
  attachment,
  sending,
}: {
  attachment: MessageAttachment;
  sending: boolean;
}) {
  const ref = useRef<NativeView>(null);
  const target = useMenuTarget({
    attachment,
    measured: ref,
    preview: <FileCard attachment={attachment} sending={sending} />,
    shape: "plain",
  });
  const { upload } = attachment;
  const stuck = isStuck(upload);
  return (
    <Pressable
      ref={ref}
      {...target?.press}
      accessibilityRole="link"
      onPress={() => {
        if (upload !== undefined && stuck) {
          showUploadProblem(upload);
        } else if (upload === undefined || upload.state === "uploaded") {
          openLink(attachment.url);
        }
      }}
    >
      <Animated.View
        className="bg-bubble-incoming w-64 rounded-2xl p-3"
        style={[{ borderCurve: "continuous" }, target?.style]}
      >
        <Animated.View
          className="flex-row items-center gap-3"
          style={uploadFade(sending)}
        >
          <View className="bg-accent size-10 items-center justify-center overflow-hidden rounded-lg">
            <SymbolIcon
              name={
                stuck
                  ? { android: "refresh", ios: "arrow.clockwise" }
                  : { android: "description", ios: "doc.fill" }
              }
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
            <Text
              className={
                stuck
                  ? "text-footnote text-destructive"
                  : "text-footnote text-muted"
              }
            >
              {stuck
                ? "Not uploaded. Tap to retry."
                : formatBytes(attachment.size)}
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export function AttachmentView({
  attachment,
  sending = false,
}: {
  attachment: MessageAttachment;
  /** Its message is still on the way; it pulses until then. */
  sending?: boolean;
}) {
  return attachment.kind === "file" ? (
    <FileCard attachment={attachment} sending={sending} />
  ) : (
    <Media attachment={attachment} sending={sending} />
  );
}
