import type { ErrorCode } from "../types/message-types";

export const ERROR_MESSAGES = {
  "stream.init_failed": "We couldn't start your response. Please try again.",
  "stream.consume_failed":
    "Your response was interrupted while streaming. Please try again.",
  "followups.failed": "",
  "convex.call_failed":
    "Something on our end failed while handling your request. Please try again.",
  "internal.defect": "An unexpected error occurred. Please try again.",
} as const satisfies Record<ErrorCode, string>;

export function getErrorMessage(code: ErrorCode) {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES["internal.defect"];
}
