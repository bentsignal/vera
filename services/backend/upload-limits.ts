// What the PDS accepts as an attachment upload. The app imports these too
// (`@vera/backend/upload-limits`), so it can turn an item away when it's
// picked instead of failing after the person taps Send. Plain functions, so
// they can be tested without Convex (the PDS side is convex/files.ts).

/** The largest upload for each kind of attachment, in bytes. */
export const MAX_UPLOAD_BYTES = {
  file: 20_000_000,
  image: 10_000_000,
  video: 50_000_000,
};

/**
 * The longest video the app lets you send. Only the app checks it, when a
 * video is picked; the PDS limits uploads by size alone.
 */
export const MAX_VIDEO_SECONDS = 60;

export type UploadKind = keyof typeof MAX_UPLOAD_BYTES;

/** The most one account can upload in any `UPLOAD_WINDOW_MS`. */
export const UPLOAD_WINDOW_BYTES = 2_000_000_000;
export const UPLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The most uploads one account can have started and not yet had checked
 * (one upload address's lifetime). Ten attachments with a poster each is
 * twenty.
 */
export const MAX_UNCHECKED_UPLOADS = 40;

/**
 * Whether the PDS takes an upload of `size` bytes. A size of 0 means the
 * app didn't know it: app versions before 2026-10 always sent 0 for a
 * video's poster frame, and turning those away made every video fail.
 */
export function uploadSizeAllowed(kind: UploadKind, size: number) {
  return Number.isFinite(size) && size >= 0 && size <= MAX_UPLOAD_BYTES[kind];
}

/** One upload an account started, as the PDS counts it. */
export interface UploadRecord {
  /** The real size once checked; until then, what it may grow to. */
  bytes: number;
  checked: boolean;
  createdAt: number;
  /** It came out bigger than its kind allows, so it was deleted. */
  oversize?: boolean;
}

/**
 * What an upload counts for before it's checked: its size, or the most its
 * kind allows when the app didn't say.
 */
export function reservedBytes(kind: UploadKind, size: number) {
  return size > 0 ? size : MAX_UPLOAD_BYTES[kind];
}

export type UploadRefusal = "UPLOAD_LIMIT_REACHED" | "UPLOAD_TOO_LARGE";

/**
 * Whether an account may start another upload, given what it started in
 * the last `UPLOAD_WINDOW_MS`: null, or why not.
 */
export function uploadRefusal(
  recent: readonly UploadRecord[],
  kind: UploadKind,
  size: number,
  now: number,
): UploadRefusal | null {
  if (!uploadSizeAllowed(kind, size)) return "UPLOAD_TOO_LARGE";
  const inWindow = recent.filter(
    (upload) => upload.createdAt > now - UPLOAD_WINDOW_MS,
  );
  // The app never sends more than it said, so whoever did gets no more
  // until the window has passed.
  if (inWindow.some((upload) => upload.oversize === true)) {
    return "UPLOAD_LIMIT_REACHED";
  }
  if (
    inWindow.filter((upload) => !upload.checked).length >= MAX_UNCHECKED_UPLOADS
  ) {
    return "UPLOAD_LIMIT_REACHED";
  }
  const used = inWindow.reduce((total, upload) => total + upload.bytes, 0);
  if (used + reservedBytes(kind, size) > UPLOAD_WINDOW_BYTES) {
    return "UPLOAD_LIMIT_REACHED";
  }
  return null;
}

/** Whether an upload that landed at `actual` bytes has to go. */
export function uploadOversize(kind: UploadKind, actual: number) {
  return actual > MAX_UPLOAD_BYTES[kind];
}

/**
 * The signed-in account's address when it belongs to this PDS's own
 * domain, or null (signed out, or someone from another server).
 */
export function localAccountId(
  identity: Readonly<Record<string, unknown>> | null,
  domain: string,
) {
  if (identity === null || identity.federated === true) return null;
  const { accountId } = identity;
  if (typeof accountId !== "string") return null;
  const separator = accountId.lastIndexOf("@");
  return separator > 0 &&
    accountId.slice(separator + 1).toLowerCase() === domain.toLowerCase()
    ? accountId
    : null;
}

/**
 * The Content-Type to store an upload under. The CDN decides what a
 * browser may show by it (infra/media-cdn), so anything unusual becomes a
 * plain download.
 */
export function uploadContentType(mimeType: string) {
  const type = mimeType.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,127}$/.test(
    type,
  )
    ? type
    : "application/octet-stream";
}

/** The file extension to store an upload under, from its name. */
export function uploadExtension(name: string) {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name);
  return match?.[1]?.toLowerCase() ?? "bin";
}
