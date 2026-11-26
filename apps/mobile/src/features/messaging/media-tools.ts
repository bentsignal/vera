import type { EventEmitter } from "expo";
import { requireOptionalNativeModule } from "expo";
import * as Crypto from "expo-crypto";
import {
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_SECONDS,
} from "@vera/backend/upload-limits";

import {
  MAX_PHOTO_SIDE,
  MAX_VIDEO_SIDES,
  PHOTO_QUALITY,
  photoOverCap,
  retryBitrate,
  videoBitrate,
  videoOverCap,
} from "./media-budget";
import { limitsSentence, TooLargeError } from "./upload-errors";

// Photos and videos over the cap (media-budget.ts) are re-encoded smaller
// while their message shows as sending (`modules/media-tools`). It's
// loaded optionally: a build made before it was added sends them as they
// were picked, and turns away videos over the upload limit when they're
// picked.

interface Shrunk {
  height: number;
  size: number;
  uri: string;
  width: number;
}

// A `Record`, not an interface, so it fits `EventEmitter`'s events map.
type ToolEvents = Record<
  "onProgress",
  (event: { fraction: number; id: string }) => void
>;

type MediaToolsModule = InstanceType<typeof EventEmitter<ToolEvents>> & {
  /** iOS: opens Quick Look at once, loading, for `previewFileAsync`. */
  beginPreviewAsync?: (title: string) => Promise<boolean>;
  cancelPreviewAsync?: () => Promise<void>;
  previewFileAsync: (uri: string) => Promise<boolean>;
  shrinkImageAsync: (options: {
    maxSide: number;
    quality: number;
    uri: string;
  }) => Promise<Shrunk>;
  shrinkVideoAsync: (options: {
    bitrate: number;
    id: string;
    maxLongSide: number;
    maxShortSide: number;
    uri: string;
  }) => Promise<Shrunk>;
};

const tools = requireOptionalNativeModule<MediaToolsModule>("VeraMediaTools");

/**
 * Whether this build has the media tools: shrinking photos and videos
 * before they're sent, and the system's file viewer.
 */
export const hasMediaTools = tools !== null;

/** A file to send, as attachments.ts stages it. */
interface Sendable {
  readonly durationMs?: number;
  readonly height?: number;
  readonly kind: "file" | "image" | "video";
  readonly mimeType: string;
  readonly name: string;
  readonly size: number;
  readonly uri: string;
  readonly width?: number;
}

/** Whether a file shrinks before it uploads, in this build. */
export function needsShrinking(file: Sendable) {
  if (tools === null) return false;
  if (file.kind === "video") return videoOverCap(file, MAX_UPLOAD_BYTES.video);
  if (file.kind === "image") return photoOverCap(file, MAX_UPLOAD_BYTES.image);
  return false;
}

async function shrinkVideoOnce(
  module: MediaToolsModule,
  uri: string,
  bitrate: number,
  onProgress: (fraction: number) => void,
) {
  const id = Crypto.randomUUID();
  const subscription = module.addListener("onProgress", (event) => {
    if (event.id === id) onProgress(event.fraction);
  });
  const result = await module
    .shrinkVideoAsync({
      bitrate,
      id,
      maxLongSide: MAX_VIDEO_SIDES.long,
      maxShortSide: MAX_VIDEO_SIDES.short,
      uri,
    })
    .catch((error: unknown) => {
      subscription.remove();
      throw error;
    });
  subscription.remove();
  return result;
}

function fits(result: Shrunk, limit: number) {
  return result.size > 0 && result.size <= limit;
}

/**
 * The video re-encoded under the cap, or null when it can't be made to fit
 * the upload limit even at the lowest bitrate worth sending.
 */
async function shrinkVideo(
  module: MediaToolsModule,
  file: Sendable,
  onProgress: (fraction: number) => void,
) {
  const limit = MAX_UPLOAD_BYTES.video;
  const first = videoBitrate(file.durationMs, limit, MAX_VIDEO_SECONDS * 1000);
  const result = await shrinkVideoOnce(module, file.uri, first, onProgress);
  if (fits(result, limit)) return result;
  // Bitrates are averages, so a video can overshoot: one lower try.
  const second = retryBitrate(first, result.size, limit);
  if (second === null) return null;
  const retried = await shrinkVideoOnce(module, file.uri, second, () => {
    // The bar already reached the end on the first try.
  });
  return fits(retried, limit) ? retried : null;
}

function shrinkPhoto(module: MediaToolsModule, uri: string) {
  return module.shrinkImageAsync({
    maxSide: MAX_PHOTO_SIDE,
    quality: PHOTO_QUALITY,
    uri,
  });
}

function withExtension(name: string, extension: string) {
  return `${name.replace(/\.[^.]*$/, "")}.${extension}`;
}

/**
 * The file to upload: as it is when it's within the cap, or shrunk,
 * reporting the shrinking's progress from 0 to 1. Throws `TooLargeError`
 * when it can't be made to fit the upload limit.
 */
export async function fitForUpload<File extends Sendable>(
  file: File,
  onProgress: (fraction: number) => void,
) {
  if (tools === null || !needsShrinking(file)) return file;
  const shrunk =
    file.kind === "video"
      ? await shrinkVideo(tools, file, onProgress)
      : await shrinkPhoto(tools, file.uri);
  if (shrunk === null || shrunk.size > MAX_UPLOAD_BYTES[file.kind]) {
    throw new TooLargeError(limitsSentence());
  }
  const video = file.kind === "video";
  return {
    ...file,
    height: shrunk.height,
    mimeType: video ? "video/mp4" : "image/jpeg",
    name: withExtension(file.name, video ? "mp4" : "jpg"),
    size: shrunk.size,
    uri: shrunk.uri,
    width: shrunk.width,
  };
}

/**
 * A video's poster frame, shrunk like a photo when this build can. One
 * that fails to shrink goes as it is.
 */
export async function fitPoster<
  File extends {
    readonly mimeType: string;
    readonly size: number;
    readonly uri: string;
  },
>(poster: File) {
  if (tools === null) return poster;
  const shrunk = await shrinkPhoto(tools, poster.uri).catch(() => null);
  return shrunk === null || shrunk.size >= poster.size
    ? poster
    : { ...poster, mimeType: "image/jpeg", size: shrunk.size, uri: shrunk.uri };
}

/**
 * Shows a local file in the system's viewer (Quick Look on iOS), and says
 * whether it did; false in a build without it.
 */
export function previewFile(uri: string) {
  return tools === null
    ? Promise.resolve(false)
    : tools.previewFileAsync(uri).catch(() => false);
}

/**
 * Opens the system's viewer straight away, loading, so a tap answers
 * before the file is on the device; `previewFile` fills it in. True when
 * it did (iOS builds that have it).
 */
export function beginPreview(title: string) {
  return tools?.beginPreviewAsync === undefined
    ? Promise.resolve(false)
    : tools.beginPreviewAsync(title).catch(() => false);
}

/** Closes a viewer `beginPreview` opened, when its file can't be had. */
export function cancelPreview() {
  return tools?.cancelPreviewAsync?.().catch(() => undefined);
}
