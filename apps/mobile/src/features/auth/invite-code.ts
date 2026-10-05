/** Invite codes are two groups of four, such as `K7QM-3XPD`. */
export const INVITE_CODE_GROUP_LENGTH = 4;
export const INVITE_CODE_LENGTH = INVITE_CODE_GROUP_LENGTH * 2;

/**
 * The code after an edit, as uppercase letters and digits with no
 * separator, so the hyphen and spaces in a pasted code drop out. Typing
 * past a full code changes nothing; pasting a whole code over a partial
 * one keeps the pasted code.
 */
export function nextInviteCode(previous: string, text: string) {
  const next = text.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (next.length <= INVITE_CODE_LENGTH) return next;
  return next.length - previous.length > 1
    ? next.slice(-INVITE_CODE_LENGTH)
    : previous;
}
