/**
 * One or two letters for a monogram. Words only, so a group titled "Maya,
 * Leo & Priya" reads "ML", and a name like "Maya (climbing)" reads "MC".
 */
export function initials(name: string) {
  const letters = name
    .split(/[\s,&]+/)
    .map((part) => part.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter((part) => part !== "")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return letters === "" ? (Array.from(name.trim())[0] ?? "") : letters;
}
