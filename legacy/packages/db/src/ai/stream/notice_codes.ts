import type { Infer } from "convex/values";
import { literals } from "convex-helpers/validators";

export const NoticeCode = {
  PremiumRequired: "notice.premium_required",
  UserAborted: "notice.user_aborted",
} as const;

export const vNoticeCode = literals(...Object.values(NoticeCode));

export type NoticeCode = Infer<typeof vNoticeCode>;
