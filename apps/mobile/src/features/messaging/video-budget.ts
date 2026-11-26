// How hard to squeeze a video that's over the upload limit (video-shrink.ts),
// as plain functions so they can be tested without the native module.

/** What a shrunk video aims for, as a share of the limit, for headroom. */
const TARGET_SHARE = 0.9;
/** Room left for the sound, which is copied as it is. */
const AUDIO_BITS_PER_SECOND = 256_000;
/** Enough for 1080p to look like the original; no need to spend more. */
const MAX_VIDEO_BITS_PER_SECOND = 6_000_000;
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
