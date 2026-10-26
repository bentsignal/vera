// Photos for assistant replies (convex/assistantImages.ts). The gateway
// fetches JPEG, PNG, WebP, and GIF from a URL; anything else would have to
// go inside the request, which ran replies out of memory (a 2.4 MB iPhone
// HEIC did on 2026-10-26). So a photo in another format, such as HEIC, is
// converted once to a JPEG of at most `MAX_SIDE` pixels a side, and the
// model gets that JPEG's URL.

/** The formats the gateway fetches from a URL. */
export const GATEWAY_URL_IMAGES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/** Longest side of a converted photo: what the models look at anyway. */
export const MAX_SIDE = 1568;

/** JPEG quality of a converted photo. */
export const JPEG_QUALITY = 85;

/**
 * The most pixels a photo can have to be converted, by the size the app
 * sent with it. Decoding one takes about 16 bytes a pixel at its peak, and
 * a Node action has 512 MB: a 24-megapixel iPhone photo peaks at about
 * 450 MB.
 */
export const MAX_PIXELS = 26_000_000;

export function fetchableByGateway(mimeType: string) {
  return GATEWAY_URL_IMAGES.includes(mimeType.toLowerCase());
}

export interface Pixels {
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly height: number;
  readonly width: number;
}

/**
 * An RGBA image scaled down so neither side is longer than `maxSide`, each
 * pixel the average of the ones it covers. Smaller images come back as
 * they are.
 */
export function shrink(image: Pixels, maxSide: number): Pixels {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  if (scale === 1) return image;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const top = Math.floor(y / scale);
    const bottom = Math.max(
      top + 1,
      Math.min(image.height, Math.floor((y + 1) / scale)),
    );
    for (let x = 0; x < width; x += 1) {
      const left = Math.floor(x / scale);
      const right = Math.max(
        left + 1,
        Math.min(image.width, Math.floor((x + 1) / scale)),
      );
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let row = top; row < bottom; row += 1) {
        for (let column = left; column < right; column += 1) {
          const from = (row * image.width + column) * 4;
          red += image.data[from] ?? 0;
          green += image.data[from + 1] ?? 0;
          blue += image.data[from + 2] ?? 0;
          alpha += image.data[from + 3] ?? 0;
        }
      }
      const count = (bottom - top) * (right - left);
      data.set(
        [red, green, blue, alpha].map((sum) => Math.round(sum / count)),
        (y * width + x) * 4,
      );
    }
  }
  return { data, height, width };
}
