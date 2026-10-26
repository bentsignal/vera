// Jumbo emoji: a message of only emoji, up to three, is drawn large with
// no bubble, like Messages.

/** The most emoji a message can have and still be drawn large. */
export const MAX_JUMBO = 3;

/**
 * One emoji as drawn: a pictograph or keycap with its modifiers, skin
 * tones, and the pictographs a zero-width joiner adds, or a flag (two
 * regional indicators).
 */
const EMOJI =
  /(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?\p{Emoji_Modifier}?)*)/gu;

/** Whether `text` is only emoji (spaces between them are fine), 1 to 3. */
export function isJumbo(text: string) {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  const found = trimmed.match(EMOJI) ?? [];
  if (found.length === 0 || found.length > MAX_JUMBO) return false;
  return trimmed.replace(EMOJI, "").replace(/\s/g, "") === "";
}
