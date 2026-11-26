import type { EventEmitter } from "expo";
import { requireOptionalNativeModule } from "expo";
import * as Crypto from "expo-crypto";
import {
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_SECONDS,
} from "@vera/backend/upload-limits";

import type { StagedFile } from "./attachments";
import { limitsSentence, TooLargeError } from "./upload-errors";
import { retryBitrate, videoBitrate } from "./video-budget";

// Videos over the upload limit are re-encoded smaller while their message
// shows as sending (`modules/video-shrink`): about 1080p, at the bitrate
// that fits. It's loaded optionally: a build made before it was added
// turns those videos away when they're picked, as before.

interface ShrinkResult {
  height: number;
  size: number;
  uri: string;
  width: number;
}

// A `Record`, not an interface, so it fits `EventEmitter`'s events map.
type ShrinkEvents = Record<
  "onProgress",
  (event: { fraction: number; id: string }) => void
>;

type VideoShrinkModule = InstanceType<typeof EventEmitter<ShrinkEvents>> & {
  shrinkAsync: (options: {
    bitrate: number;
    id: string;
    maxLongSide: number;
    maxShortSide: number;
    uri: string;
  }) => Promise<ShrinkResult>;
};

const shrinker =
  requireOptionalNativeModule<VideoShrinkModule>("VeraVideoShrink");

/** Whether this build can shrink a video that's over the upload limit. */
export const shrinksVideos = shrinker !== null;

/** Whether a staged file has to shrink before it uploads. */
export function needsShrinking(file: StagedFile) {
  return file.kind === "video" && file.size > MAX_UPLOAD_BYTES.video;
}

async function shrinkOnce(
  module: VideoShrinkModule,
  file: StagedFile,
  bitrate: number,
  onProgress: (fraction: number) => void,
) {
  const id = Crypto.randomUUID();
  const subscription = module.addListener("onProgress", (event) => {
    if (event.id === id) onProgress(event.fraction);
  });
  const result = await module
    .shrinkAsync({
      bitrate,
      id,
      maxLongSide: 1920,
      maxShortSide: 1080,
      uri: file.uri,
    })
    .catch((error: unknown) => {
      subscription.remove();
      throw error;
    });
  subscription.remove();
  return result;
}

/**
 * The video re-encoded under the upload limit, or null when it can't be:
 * no module in this build, or still too big at the lowest bitrate worth
 * sending. Reports progress from 0 to 1.
 */
export async function shrinkVideo(
  file: StagedFile,
  onProgress: (fraction: number) => void,
) {
  if (shrinker === null) return null;
  const limit = MAX_UPLOAD_BYTES.video;
  const first = videoBitrate(file.durationMs, limit, MAX_VIDEO_SECONDS * 1000);
  const result = await shrinkOnce(shrinker, file, first, onProgress);
  if (result.size > 0 && result.size <= limit) return shrunkFile(file, result);
  // Bitrates are averages, so a video can overshoot: one lower try.
  const second = retryBitrate(first, result.size, limit);
  if (second === null) return null;
  const retried = await shrinkOnce(shrinker, file, second, () => undefined);
  return retried.size > 0 && retried.size <= limit
    ? shrunkFile(file, retried)
    : null;
}

function shrunkFile(file: StagedFile, result: ShrinkResult) {
  return {
    ...file,
    height: result.height,
    mimeType: "video/mp4",
    name: `${file.name.replace(/\.[^.]*$/, "")}.mp4`,
    size: result.size,
    uri: result.uri,
    width: result.width,
  } satisfies StagedFile;
}

/**
 * The file to upload: as it is when it fits, or shrunk to fit, reporting
 * the shrinking's progress from 0 to 1. Throws `TooLargeError` when it
 * can't be made to fit.
 */
export async function fitForUpload(
  file: StagedFile,
  onProgress: (fraction: number) => void,
) {
  if (!needsShrinking(file)) return file;
  const shrunk = await shrinkVideo(file, onProgress);
  if (shrunk === null) throw new TooLargeError(limitsSentence());
  return shrunk;
}
