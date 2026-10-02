/** Joins class names, skipping falsy entries. */
export function cn(...classNames: (string | false | null | undefined)[]) {
  return classNames.filter(Boolean).join(" ");
}
