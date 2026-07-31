import type { Infer } from "convex/values";
import { literals } from "convex-helpers/validators";

export const ErrorCode = {
  StreamInitFailed: "stream.init_failed",
  StreamConsumeFailed: "stream.consume_failed",
  FollowUpsFailed: "followups.failed",
  ConvexCallFailed: "convex.call_failed",
  InternalDefect: "internal.defect",
} as const;

export const vErrorCode = literals(...Object.values(ErrorCode));

export type ErrorCode = Infer<typeof vErrorCode>;

export function isUserVisible(code: ErrorCode) {
  switch (code) {
    case ErrorCode.StreamInitFailed:
    case ErrorCode.StreamConsumeFailed:
    case ErrorCode.ConvexCallFailed:
    case ErrorCode.InternalDefect:
      return true;
    case ErrorCode.FollowUpsFailed:
      return false;
  }
}
