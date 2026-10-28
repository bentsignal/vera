/**
 * The draft with dictated words added at its end, with a space between
 * them unless the draft already ends in one (or a new line). Nothing heard
 * leaves the draft as it was.
 */
export function withDictation(draft: string, heard: string) {
  const words = heard.trim();
  if (words === "") return draft;
  if (draft === "" || /\s$/.test(draft)) return draft + words;
  return `${draft} ${words}`;
}
