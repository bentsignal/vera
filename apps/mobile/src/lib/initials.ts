/**
 * One or two letters for a monogram. Words only, so a group titled "Maya,
 * Leo & Priya" reads "ML".
 */
export function initials(name: string) {
  return name
    .split(/[\s,&]+/)
    .filter((part) => part !== "")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
