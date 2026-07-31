import type { Infer } from "convex/values";
import { v } from "convex/values";

import { vErrorCode } from "../../ai/stream/error_codes";
import { vNoticeCode } from "../../ai/stream/notice_codes";

export { vErrorCode, vNoticeCode };

export const vSystemError = v.object({
  code: vErrorCode,
  generationId: v.optional(v.string()),
  timestamp: v.optional(v.number()),
});

export const vSystemNotice = v.object({
  code: vNoticeCode,
});

export type SystemError = Infer<typeof vSystemError>;
export type SystemNotice = Infer<typeof vSystemNotice>;
