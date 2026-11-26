// Which photos and videos shrink before they're sent, and how hard
// (media-tools.ts), as plain functions so they can be tested without the
// native module. Every video is capped at about 1080p and 6 Mbps, and every
// photo at 2048 pixels on its long side, to keep what each message costs to
// store and serve down; media already within that goes as it is.

/** What a shrunk video aims for, as a share of the limit, for headroom. */
const TARGET_SHARE = 0.9;
/** Room left for the sound, which is copied as it is. */
const AUDIO_BITS_PER_SECOND = 256_000;
/** Enough for 1080p to look like the original; no need to spend more. */
export const MAX_VIDEO_BITS_PER_SECOND = 6_000_000;
/** A video's long and short sides, at most. */
export const MAX_VIDEO_SIDES = { long: 1920, short: 1080 };
/** A photo's long side, at most, and its JPEG quality when shrunk. */
export const MAX_PHOTO_SIDE = 2048;
export const PHOTO_QUALITY = 0.8;
/** How far over the cap a video's whole bitrate (sound included) may be. */
const BITRATE_SLACK = 1.1;
/** Below this, 1080p turns visibly blocky; better to refuse the video. */
export const MIN_VIDEO_BITS_PER_SECOND = 1_000_000;

/**
 * The video bitrate that brings a video of `durationMs` under `maxBytes`,
 * never more than 1080p needs. An unknown length counts as `fallbackMs`.
 */
export function videoBitrate(
  durationMs: number | undefined,
  maxBytes: number,
  fallbackMs: number,
) {
  const seconds = Math.max(1, (durationMs ?? fallbackMs) / 1000);
  const budget =
    (maxBytes * TARGET_SHARE * 8) / seconds - AUDIO_BITS_PER_SECOND;
  return Math.round(Math.min(MAX_VIDEO_BITS_PER_SECOND, budget));
}

/**
 * A lower bitrate for a second try, when the first came out at
 * `actualBytes` against `maxBytes`, or null when it can't go lower.
 */
export function retryBitrate(
  bitrate: number,
  actualBytes: number,
  maxBytes: number,
) {
  const next = Math.round((bitrate * maxBytes * TARGET_SHARE) / actualBytes);
  return next >= MIN_VIDEO_BITS_PER_SECOND && next < bitrate ? next : null;
}

interface Media {
  readonly durationMs?: number;
  readonly height?: number;
  readonly mimeType: string;
  readonly size: number;
  readonly width?: number;
}

function sides({ height = 0, width = 0 }: Media) {
  return { long: Math.max(width, height), short: Math.min(width, height) };
}

/**
 * Whether a video is over the cap: bigger than 1080p, more bits a second
 * than 1080p needs, or over `maxBytes`. One whose size isn't known counts
 * as over.
 */
export function videoOverCap(video: Media, maxBytes: number) {
  const { long, short } = sides(video);
  if (long === 0 || video.size > maxBytes) return true;
  if (long > MAX_VIDEO_SIDES.long || short > MAX_VIDEO_SIDES.short) return true;
  const seconds = (video.durationMs ?? 0) / 1000;
  if (seconds <= 0) return true;
  const bitrate = (video.size * 8) / seconds;
  return bitrate > MAX_VIDEO_BITS_PER_SECOND * BITRATE_SLACK;
}

/**
 * Whether a photo is over the cap: longer than 2048 pixels, or over
 * `maxBytes`. GIFs are left alone, since a JPEG would stop them moving.
 */
export function photoOverCap(photo: Media, maxBytes: number) {
  if (photo.mimeType.toLowerCase() === "image/gif") return false;
  const { long } = sides(photo);
  return long === 0 || long > MAX_PHOTO_SIDE || photo.size > maxBytes;
}
