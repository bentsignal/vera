import { MAX_UPLOAD_BYTES } from "@vera/backend/upload-limits";
import { ConvexError } from "convex/values";

import { formatBytes } from "~/lib/format";

/** An upload problem worth showing the person as-is. */
export class AttachmentError extends Error {}

/** The PDS turned the file away for its size, so retrying won't help. */
export class TooLargeError extends AttachmentError {}

/** The account has uploaded as much as the PDS takes for now. */
export class LimitReachedError extends AttachmentError {}

export function limitsSentence() {
  return `You can send videos up to ${formatBytes(MAX_UPLOAD_BYTES.video)}, photos up to ${formatBytes(MAX_UPLOAD_BYTES.image)}, and other files up to ${formatBytes(MAX_UPLOAD_BYTES.file)}.`;
}

function errorCode(data: unknown) {
  return typeof data === "object" && data !== null && "code" in data
    ? data.code
    : undefined;
}

/** The error to throw for an upload error: the PDS's refusals as above. */
export function attachmentError(error: unknown) {
  if (error instanceof ConvexError) {
    const code = errorCode(error.data);
    if (code === "UPLOAD_TOO_LARGE") return new TooLargeError(limitsSentence());
    if (code === "UPLOAD_LIMIT_REACHED") {
      return new LimitReachedError("You've uploaded a lot today.");
    }
  }
  return error;
}

/** How a failed upload shows in the conversation. */
export function failedUploadState(error: unknown) {
  if (error instanceof TooLargeError) return "too-large" as const;
  if (error instanceof LimitReachedError) return "limited" as const;
  return "failed" as const;
}

export type FailedUploadState = ReturnType<typeof failedUploadState>;

/** Whether sending again uploads it again. */
export function retriable(state: string) {
  return state === "failed" || state === "limited";
}
