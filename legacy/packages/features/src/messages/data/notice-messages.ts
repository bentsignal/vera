import type { NoticeCode } from "../types/message-types";

export const NOTICE_MESSAGES = {
  "notice.premium_required": `Unfortunately, I was unable to complete this request. To gain access to this functionality, upgrade to a premium plan.`,
  "notice.user_aborted": `Response stopped early.`,
} as const satisfies Record<NoticeCode, string>;

export function getNoticeMessage(code: NoticeCode) {
  return NOTICE_MESSAGES[code];
}
